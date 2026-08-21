//! S0.7 EV1 runtime wiring — call `everyaios-eval` at task completion so a
//! K1 work receipt can carry a verified-conformance claim.
//!
//! Today EV1 is a crate-level verifier (`cargo test`). This service is the
//! JSON-RPC surface (`eval/verify`) the coordinator hits when a plan (or
//! other task) finishes.

use everyaios_eval::{verify, Constraint, OutcomeCheck, TaskManifest, VerificationReport};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct EvalService {
    last: Option<VerificationReport>,
}

impl EvalService {
    pub fn new() -> Self {
        Self { last: None }
    }

    pub fn last_report(&self) -> Option<&VerificationReport> {
        self.last.as_ref()
    }

    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "eval/verify" => self.verify(params),
            "eval/last" => Ok(json!({
                "report": self.last,
            })),
            _ => Err(format!("method not found: {method}")),
        }
    }

    fn verify(&mut self, params: &Value) -> Result<Value, String> {
        let task_id = params
            .get("taskId")
            .and_then(Value::as_str)
            .unwrap_or("task")
            .to_string();
        let goal = params
            .get("goal")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let workspace = params
            .get("workspace")
            .and_then(Value::as_str)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        let mut required_outcomes = Vec::new();
        if let Some(arr) = params.get("outcomes").and_then(Value::as_array) {
            for o in arr {
                if let Some(c) = outcome_from_json(o) {
                    required_outcomes.push(c);
                }
            }
        }
        if let Some(arr) = params.get("verify").and_then(Value::as_array) {
            for v in arr {
                if let Some(s) = v.as_str() {
                    if looks_like_path(s) {
                        required_outcomes.push(OutcomeCheck::FileExists {
                            path: s.to_string(),
                        });
                    }
                }
            }
        }
        let manifest = TaskManifest {
            task_id: task_id.clone(),
            goal,
            required_outcomes,
            constraints: vec![Constraint::NeverSendToExternalDomains],
            budgets: Default::default(),
            evidence: vec![],
        };
        let report = verify(&manifest, Path::new(&workspace));
        let status_label = report.status.label().to_string();
        let verified = report.status.is_complete();
        self.last = Some(report.clone());
        Ok(json!({
            "taskId": task_id,
            "verified": verified,
            "status": status_label,
            "report": report,
        }))
    }
}

fn looks_like_path(s: &str) -> bool {
    s.contains('/') || s.contains('.') && !s.contains(' ')
}

fn outcome_from_json(v: &Value) -> Option<OutcomeCheck> {
    let check = v.get("check").and_then(Value::as_str)?;
    let path = v.get("path").and_then(Value::as_str)?.to_string();
    match check {
        "file_exists" | "exists" => Some(OutcomeCheck::FileExists { path }),
        "file_contains" | "contains" => Some(OutcomeCheck::FileContains {
            path,
            substring: v
                .get("substring")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "everyaios-eval-svc-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn verify_complete_when_file_exists() {
        let dir = tmp();
        fs::write(dir.join("out.txt"), "ok").unwrap();
        let mut svc = EvalService::new();
        let out = svc
            .handle(
                "eval/verify",
                &json!({
                    "taskId": "t1",
                    "workspace": dir.to_string_lossy(),
                    "goal": "write out.txt",
                    "outcomes": [{ "check": "file_exists", "path": "out.txt" }]
                }),
            )
            .unwrap();
        assert_eq!(out["verified"], true);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unverifiable_when_no_outcomes() {
        let mut svc = EvalService::new();
        let out = svc
            .handle("eval/verify", &json!({ "taskId": "t2", "goal": "chat" }))
            .unwrap();
        assert_eq!(out["verified"], false);
    }
}
