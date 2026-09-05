//! P51.10 — multi-model runs: fan out to ≤5 models, fuse or keep-best,
//! and render ordered diff walkthroughs.
//!
//! Pure and deterministic: construction validates the model budget, [`collect`]
//! reduces per-model outcomes, and [`walkthrough`] parses a unified diff into
//! ordered narrative steps. No execution happens here.

use serde::{Deserialize, Serialize};

/// How a [`MultiRun`]'s outcomes are reduced.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FuseMode {
    KeepBest,
    Fuse,
}

/// One fan-out run: the same task attempted by several models, each in its
/// own worktree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MultiRun {
    pub id: String,
    pub task_id: String,
    pub model_ids: Vec<String>,
    pub worktree_ids: Vec<String>,
    pub mode: FuseMode,
}

impl MultiRun {
    /// Construct a run, validating the model budget (≤5 models).
    pub fn new(
        id: impl Into<String>,
        task_id: impl Into<String>,
        model_ids: Vec<String>,
        worktree_ids: Vec<String>,
        mode: FuseMode,
    ) -> Result<Self, String> {
        if model_ids.len() > 5 {
            return Err(format!(
                "multirun supports at most 5 models, got {}",
                model_ids.len()
            ));
        }
        Ok(Self {
            id: id.into(),
            task_id: task_id.into(),
            model_ids,
            worktree_ids,
            mode,
        })
    }

    /// Alias for [`MultiRun::new`].
    pub fn try_new(
        id: impl Into<String>,
        task_id: impl Into<String>,
        model_ids: Vec<String>,
        worktree_ids: Vec<String>,
        mode: FuseMode,
    ) -> Result<Self, String> {
        Self::new(id, task_id, model_ids, worktree_ids, mode)
    }
}

/// One model's attempt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunOutcome {
    pub model_id: String,
    pub output: String,
    pub score: f64,
}

/// The reduced result of [`collect`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollectedRun {
    pub output: String,
    pub best_model_id: Option<String>,
    pub score: f64,
    pub mode: FuseMode,
}

/// Reduce `outcomes` per `mode`:
/// - [`FuseMode::KeepBest`] → the highest-score output.
/// - [`FuseMode::Fuse`] → every part concatenated with per-model attribution
///   headers (`## <model_id> (score …)`), best score first.
pub fn collect(outcomes: Vec<RunOutcome>, mode: FuseMode) -> CollectedRun {
    if outcomes.is_empty() {
        return CollectedRun {
            output: String::new(),
            best_model_id: None,
            score: 0.0,
            mode,
        };
    }
    let mut ranked = outcomes;
    ranked.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let best = &ranked[0];
    match mode {
        FuseMode::KeepBest => CollectedRun {
            output: best.output.clone(),
            best_model_id: Some(best.model_id.clone()),
            score: best.score,
            mode,
        },
        FuseMode::Fuse => {
            let parts: Vec<String> = ranked
                .iter()
                .map(|o| format!("## {} (score {:.2})\n{}", o.model_id, o.score, o.output))
                .collect();
            CollectedRun {
                output: parts.join("\n\n"),
                best_model_id: Some(best.model_id.clone()),
                score: best.score,
                mode,
            }
        }
    }
}

/// One ordered step of a diff walkthrough.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderedDiffStep {
    pub seq: usize,
    pub path: String,
    pub hunk: String,
    pub narrative: String,
}

/// Parse a unified diff into ordered narrative steps.
///
/// A new step starts at every `@@` hunk header; the path tracks the most
/// recent `diff --git a/… b/…` (or `+++ b/…`) line. Steps are numbered in
/// document order (`seq` from 0).
pub fn walkthrough(diff_unified: &str) -> Vec<OrderedDiffStep> {
    let mut steps: Vec<OrderedDiffStep> = Vec::new();
    let mut path = "unknown".to_string();
    for line in diff_unified.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            let mut parts = rest.split_whitespace();
            let a = parts.next().unwrap_or("");
            let b = parts.next().unwrap_or(a);
            let p = b.strip_prefix("b/").unwrap_or(b);
            if !p.is_empty() && p != "/dev/null" {
                path = p.to_string();
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("+++ ") {
            let p = rest.trim().strip_prefix("b/").unwrap_or(rest.trim());
            if !p.is_empty() && p != "/dev/null" {
                path = p.to_string();
            }
            continue;
        }
        if line.starts_with("@@") {
            let seq = steps.len();
            steps.push(OrderedDiffStep {
                seq,
                path: path.clone(),
                hunk: line.to_string(),
                narrative: format!("Step {}: review {} ({})", seq + 1, path, line),
            });
            continue;
        }
        if let Some(step) = steps.last_mut() {
            step.hunk.push('\n');
            step.hunk.push_str(line);
        }
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    fn models(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("model-{i}")).collect()
    }

    #[test]
    fn multirun_rejects_six_models() {
        let err = MultiRun::new(
            "run-1",
            "task-1",
            models(6),
            vec!["wt-1".to_string()],
            FuseMode::KeepBest,
        )
        .expect_err("six models must be rejected");
        assert!(err.contains('6') || err.contains('5'), "got: {err}");
        // Five is the budget edge and still fits.
        assert!(MultiRun::new(
            "run-1",
            "task-1",
            models(5),
            vec!["wt-1".to_string()],
            FuseMode::KeepBest,
        )
        .is_ok());
    }

    #[test]
    fn keep_best_picks_highest() {
        let outcomes = vec![
            RunOutcome {
                model_id: "a".into(),
                output: "meh".into(),
                score: 0.2,
            },
            RunOutcome {
                model_id: "b".into(),
                output: "best".into(),
                score: 0.9,
            },
            RunOutcome {
                model_id: "c".into(),
                output: "mid".into(),
                score: 0.5,
            },
        ];
        let got = collect(outcomes, FuseMode::KeepBest);
        assert_eq!(got.output, "best");
        assert_eq!(got.best_model_id.as_deref(), Some("b"));
        assert!((got.score - 0.9).abs() < f64::EPSILON);
    }

    #[test]
    fn fuse_attributes_parts() {
        let outcomes = vec![
            RunOutcome {
                model_id: "a".into(),
                output: "alpha".into(),
                score: 0.7,
            },
            RunOutcome {
                model_id: "b".into(),
                output: "beta".into(),
                score: 0.4,
            },
        ];
        let got = collect(outcomes, FuseMode::Fuse);
        assert!(got.output.contains("## a"), "missing attribution for a");
        assert!(got.output.contains("## b"), "missing attribution for b");
        assert!(got.output.contains("alpha"));
        assert!(got.output.contains("beta"));
        // Best-first: `a` (0.7) precedes `b` (0.4).
        assert!(got.output.find("## a").unwrap() < got.output.find("## b").unwrap());
    }

    #[test]
    fn walkthrough_orders_hunks() {
        let diff = "\
diff --git a/src/a.rs b/src/a.rs
@@ -1,2 +1,3 @@
 ctx
+one
diff --git a/src/b.rs b/src/b.rs
@@ -10,2 +10,3 @@ fn b()
 ctx
+two
";
        let steps = walkthrough(diff);
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].seq, 0);
        assert_eq!(steps[1].seq, 1);
        assert!(steps[0].seq < steps[1].seq);
        assert_eq!(steps[0].path, "src/a.rs");
        assert_eq!(steps[1].path, "src/b.rs");
        assert!(steps[0].hunk.contains("@@"));
        assert!(!steps[0].narrative.is_empty());
    }
}
