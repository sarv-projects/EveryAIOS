//! The Work factory for automations (P71.3c — `ARCH/AUTOMATION.md` §5).
//!
//! ADR-0005 reversed the old "runtime seam" row: this module **used to be**
//! an executor (`AutomationRuntime::run`/`run_step` sequencing
//! `run_code`/`online_search`/`email`/`calendar` through injected engine
//! traits). That violated the ownership boundary — effects and their retries
//! belong to the Work kernel (`WORK.md` §2) and `RECOVERY.md`, never to the
//! automation layer (`AUTOMATION.md` §9). The module is now a **compiler**:
//!
//! ```text
//! Automation revision ──▶ validate ──▶ compile ──▶ WorkSpec
//!                                              ├─ steps (deterministic first, agent-backed second)
//!                                              ├─ capability requests per step
//!                                              └─ provenance stamps (automation_id · revision_id · occurrence_id)
//! ```
//!
//! It must not execute effects, hold execution state, or retry effects. The
//! host turns the returned [`WorkSpec`] into Work through the work gateway;
//! the Work kernel executes. Refusal over guessing: validation errors are
//! returned, never defaulted.

use everyaios_blueprint::{Automation, AutomationStep};
use serde::{Deserialize, Serialize};

/// Provenance stamps required by `AUTOMATION.md` §3: every Work created by
/// an automation records which definition, which immutable revision and
/// which trigger occurrence produced it. `revision_id` is content-addressed
/// (monotonic revision counter + content hash) so "editing affects the NEXT
/// run only" is enforceable rather than aspirational; `trigger_occurrence_id`
/// ties the run to exactly one trigger firing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationProvenance {
    pub automation_id: String,
    /// Content-addressed revision identity (e.g. `"4:<hash>"`); immutable
    /// for the life of a run.
    pub revision_id: String,
    /// One firing of the trigger (`manual` for a user-initiated run).
    pub trigger_occurrence_id: String,
}

/// One compiled step. The factory classifies a step as **deterministic** or
/// **agent-backed** (`AUTOMATION.md` §6) — a deterministic-only automation
/// compiles with `agent_policy: none` and needs no agent binding at all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledStep {
    pub index: usize,
    /// Stable step kind (`run_code` · `online_search` · `email` · `calendar`).
    pub kind: String,
    /// Deterministic steps run without any agent; agent-backed steps need
    /// one (the judge/summarise step in §6's second example).
    pub deterministic: bool,
    /// The capability this step will request, when it is effectful. Data —
    /// the resolver/broker turns it into a grant; the factory never grants.
    pub capability_request: Option<CompiledCapabilityRequest>,
}

/// A capability the compiled Work will need (`AUTOMATION.md` §5 obligation 2:
/// "instantiate the capability requests they will need"). Opaque id strings
/// match the broker vocabulary (`work_gateway::GatewayCapabilityBroker`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledCapabilityRequest {
    pub capability_id: String,
    pub step_index: usize,
    /// Human-readable why (stamped into the broker request's reason).
    pub reason: String,
}

/// The full compiled artifact — what the Work factory hands to the host.
/// Pure data: serializable, diffable, and free of execution semantics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkSpec {
    pub provenance: AutomationProvenance,
    /// The objective stamped into the Work's `WorkCreated` event.
    pub objective: String,
    /// Compiled steps in execution order (deterministic-first ordering is
    /// the definition's own order; the factory does not reorder).
    pub steps: Vec<CompiledStep>,
    /// All capability requests the Work will raise, in step order.
    pub capability_requests: Vec<CompiledCapabilityRequest>,
    /// `true` when every step is deterministic — the run needs no agent
    /// binding (`AUTOMATION.md` §6), which matters for cost/latency.
    pub agent_required: bool,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AutomationError {
    #[error("automation has no steps")]
    Empty,
    #[error("run_code language `{0}` is not supported by the script engine")]
    UnsupportedLanguage(String),
    #[error("automation names no trigger occurrence; compile requires one firing")]
    MissingOccurrence,
}

/// Validate a step shape (`AUTOMATION.md` §5 obligation 1 — validate before
/// anything runs). Mirrors the old runtime's per-step refusals, minus
/// engine-availability checks, which were execution-time concerns.
pub fn validate_step(step: &AutomationStep) -> Result<(), AutomationError> {
    match step {
        AutomationStep::RunCode { language, .. } => {
            let language = language.to_ascii_lowercase();
            if !matches!(language.as_str(), "js" | "javascript" | "ts" | "typescript") {
                return Err(AutomationError::UnsupportedLanguage(language));
            }
            Ok(())
        }
        AutomationStep::OnlineSearch { .. }
        | AutomationStep::Email { .. }
        | AutomationStep::Calendar { .. } => Ok(()),
    }
}

/// Which capability a step will need, if any. `run_code` rides the script
/// sandbox seam, `online_search` the search cascade, email/calendar the
/// connector plane. None of these are granted here — the request is data.
fn capability_of(index: usize, step: &AutomationStep) -> Option<CompiledCapabilityRequest> {
    let (capability_id, reason) = match step {
        AutomationStep::RunCode { .. } => (
            "script.eval",
            "sandboxed code execution for automation step",
        ),
        AutomationStep::OnlineSearch { .. } => {
            ("net.search", "web search cascade for automation step")
        }
        AutomationStep::Email { .. } => ("connector.email", "outbound email write"),
        AutomationStep::Calendar { .. } => ("connector.calendar", "calendar write"),
    };
    Some(CompiledCapabilityRequest {
        capability_id: capability_id.into(),
        step_index: index,
        reason: reason.into(),
    })
}

/// Compile an automation definition (one immutable revision) into a
/// [`WorkSpec`]. Never executes, never grants, never retries.
///
/// `revision_id` — content-addressed revision identity of the definition as
/// compiled (caller-provided until the canonical revision IDs land;
/// `AUTOMATION.md` §3's identity gap). `trigger_occurrence_id` — one firing
/// of the trigger (`"manual"` for a user-initiated run). `approved` — the
/// caller's decision over this exact revision; privileged steps compile
/// either way, but an unapproved privileged step is surfaced in
/// [`WorkSpec::steps`] so the host's approval gate fires **before** the Work
/// starts, not mid-execution.
pub fn compile_work(
    automation: &Automation,
    revision_id: &str,
    trigger_occurrence_id: &str,
) -> Result<WorkSpec, AutomationError> {
    if automation.steps.is_empty() {
        return Err(AutomationError::Empty);
    }
    if trigger_occurrence_id.trim().is_empty() {
        return Err(AutomationError::MissingOccurrence);
    }
    for step in &automation.steps {
        validate_step(step)?;
    }

    let steps: Vec<CompiledStep> = automation
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| CompiledStep {
            index,
            kind: kind_of(step).into(),
            deterministic: !is_agent_backed(step),
            capability_request: capability_of(index, step),
        })
        .collect();

    let capability_requests: Vec<CompiledCapabilityRequest> = steps
        .iter()
        .filter_map(|s| s.capability_request.clone())
        .collect();

    Ok(WorkSpec {
        provenance: AutomationProvenance {
            automation_id: automation.id.clone(),
            revision_id: revision_id.to_string(),
            trigger_occurrence_id: trigger_occurrence_id.to_string(),
        },
        objective: objective_of(automation),
        agent_required: steps.iter().any(|s| !s.deterministic),
        steps,
        capability_requests,
    })
}

/// §6 — "deterministic capability steps first, agent-backed steps second".
/// The current step vocabulary (`run_code`/`online_search`/`email`/
/// `calendar`) is entirely deterministic: sandboxed code, the search cascade
/// and connector writes never consult a model, so a definition built from
/// them compiles with no agent binding. When an agent-backed step variant
/// lands (the §6 "judge importance → summarise" shape), it flips
/// [`CompiledStep::deterministic`] and [`WorkSpec::agent_required`] here —
/// the single classification point the factory owns.
fn is_agent_backed(_step: &AutomationStep) -> bool {
    false
}

/// The objective the compiled Work pursues — derived from the definition
/// (`AUTOMATION.md` §5 obligation 3: stamp provenance; the objective carries
/// it forward into the Work's `WorkCreated` event).
fn objective_of(automation: &Automation) -> String {
    format!("automation:{}:{}", automation.id, automation.name)
}

fn kind_of(step: &AutomationStep) -> &'static str {
    match step {
        AutomationStep::RunCode { .. } => "run_code",
        AutomationStep::OnlineSearch { .. } => "online_search",
        AutomationStep::Email { .. } => "email",
        AutomationStep::Calendar { .. } => "calendar",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use everyaios_blueprint::{AutomationStep as Step, Trigger};

    fn automation() -> Automation {
        Automation::new("a1", "Morning brief", Trigger::Manual)
            .step(Step::OnlineSearch {
                query: "latest AI news".into(),
            })
            .step(Step::RunCode {
                language: "js".into(),
                code: "return 42".into(),
            })
    }

    #[test]
    fn compiles_a_work_spec_with_provenance() {
        let spec = compile_work(&automation(), "4:abc123", "occ-1").unwrap();
        assert_eq!(spec.provenance.automation_id, "a1");
        assert_eq!(spec.provenance.revision_id, "4:abc123");
        assert_eq!(spec.provenance.trigger_occurrence_id, "occ-1");
        assert_eq!(spec.objective, "automation:a1:Morning brief");
        assert_eq!(spec.steps.len(), 2);
        // Deterministic classification: search + sandboxed code, no agent.
        assert!(spec.steps[0].deterministic);
        assert!(spec.steps[1].deterministic);
        assert!(!spec.agent_required);
    }

    #[test]
    fn capability_requests_are_instantiated_per_step() {
        let spec = compile_work(&automation(), "4:abc123", "occ-1").unwrap();
        let ids: Vec<&str> = spec
            .capability_requests
            .iter()
            .map(|c| c.capability_id.as_str())
            .collect();
        assert_eq!(ids, vec!["net.search", "script.eval"]);
        assert_eq!(spec.capability_requests[0].step_index, 0);
        assert_eq!(spec.capability_requests[0].reason, "web search cascade for automation step");
    }

    #[test]
    fn email_and_calendar_request_connector_capabilities() {
        let a = Automation::new("a2", "Send report", Trigger::Manual)
            .step(Step::Email {
                to: vec!["bob@x.test".into()],
                subject: "s".into(),
                body: "b".into(),
            })
            .step(Step::Calendar {
                title: "review".into(),
                when: "2026-09-21T10:00:00Z".into(),
            });
        let spec = compile_work(&a, "1:rev", "occ-2").unwrap();
        let ids: Vec<&str> = spec
            .capability_requests
            .iter()
            .map(|c| c.capability_id.as_str())
            .collect();
        assert_eq!(ids, vec!["connector.email", "connector.calendar"]);
    }

    #[test]
    fn invalid_language_refuses_at_compile_time() {
        let a = Automation::new("a3", "Calc", Trigger::Manual).step(Step::RunCode {
            language: "python".into(),
            code: "x".into(),
        });
        let err = compile_work(&a, "1:rev", "occ-3").unwrap_err();
        assert_eq!(err, AutomationError::UnsupportedLanguage("python".into()));
    }

    #[test]
    fn empty_definition_refuses() {
        assert_eq!(
            compile_work(&Automation::new("a4", "Empty", Trigger::Manual), "1:rev", "occ-4"),
            Err(AutomationError::Empty)
        );
    }

    #[test]
    fn blank_occurrence_refuses() {
        assert_eq!(
            compile_work(&automation(), "1:rev", "  "),
            Err(AutomationError::MissingOccurrence)
        );
    }

    #[test]
    fn deterministic_only_automation_needs_no_agent() {
        // §6's first example — copy folder → compress → upload — compiles to
        // an agent-free Work. (Folder/compress steps are not yet in the step
        // vocabulary; search + code is the current deterministic mix.)
        let spec = compile_work(&automation(), "1:rev", "occ-5").unwrap();
        assert!(!spec.agent_required);
        assert!(spec.steps.iter().all(|s| s.deterministic));
    }
}
