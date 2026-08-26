//! P14-5 — Sync automation (doc 66 §1.4 — deferred maintenance loop): the
//! vendored `models.json` baseline ships **static**; a refresh path exists
//! for when we need it. This module owns the two halves:
//!
//! 1. **The 30-provider pattern** — one `SyncSpec` per provider (source URL
//!    + the fields it owns), so a refresh is per-provider and mergeable,
//!    never one giant opaque blob.
//! 2. **The `bun validate`-style gate** — `validate_vendored` runs over the
//!    shipped baseline before *any* sync output is accepted: schema shape,
//!    non-negative pricing, the two-tier blocker rule, no duplicate ids.
//!
//! The live fetch (network) is a documented runtime seam — this module is
//! pure and testable without network access.

use crate::model::ModelEntry;
use crate::tier::validate_tiers;

/// One per-provider sync module (the 30-provider pattern: each provider is
/// refreshed independently and merged into the baseline).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncSpec {
    /// The provider key (matches `provider()` on the entries it owns).
    pub provider: &'static str,
    /// Source of truth for this provider's rows (API/URL/file).
    pub source: &'static str,
    /// The fields this provider's sync module is allowed to write. Anything
    /// outside this set is a schema violation on ingest.
    pub writable_fields: &'static [&'static str],
}

/// The per-provider refresh modules the maintenance loop runs (post-v1 —
/// the vendored baseline ships static today).
pub const SYNC_MODULES: &[SyncSpec] = &[
    SyncSpec { provider: "anthropic", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters", "context_length"] },
    SyncSpec { provider: "openai", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters", "context_length"] },
    SyncSpec { provider: "google", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters", "context_length"] },
    SyncSpec { provider: "mistral", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters"] },
    SyncSpec { provider: "meta", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters"] },
    SyncSpec { provider: "cohere", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters"] },
    SyncSpec { provider: "xai", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters"] },
    SyncSpec { provider: "deepseek", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters"] },
    SyncSpec { provider: "qwen", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters"] },
    SyncSpec { provider: "groq", source: "https://models.dev/api", writable_fields: &["pricing", "top_provider", "supported_parameters"] },
];

/// A single gate finding (the `bun validate` output line).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateFinding {
    pub severity: Severity,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

/// The gate: run over the shipped baseline (or a proposed sync output)
/// before it is accepted. Honest — the gate never soft-passes.
///
/// `known_labs` is the canonical lab-model id set the baseline maintains
/// (the lab set is a *fact*, never derivable from the override rows).
pub fn validate_vendored(entries: &[ModelEntry], known_labs: &[&str]) -> Vec<GateFinding> {
    let mut findings = Vec::new();
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();

    for e in entries {
        if e.id.is_empty() {
            findings.push(GateFinding { severity: Severity::Error, message: "empty id row".into() });
            continue;
        }
        if !seen.insert(&e.id) {
            findings.push(GateFinding {
                severity: Severity::Error,
                message: format!("duplicate id `{}`", e.id),
            });
        }
        if e.pricing.prompt < 0.0 || e.pricing.completion < 0.0 {
            findings.push(GateFinding {
                severity: Severity::Error,
                message: format!("`{}` has negative pricing", e.id),
            });
        }
        if e.effective_context() == 0 {
            findings.push(GateFinding {
                severity: Severity::Error,
                message: format!("`{}` has no context length", e.id),
            });
        }
        if e.provider().is_empty() {
            findings.push(GateFinding {
                severity: Severity::Error,
                message: format!("`{}` has no provider segment", e.id),
            });
        }
    }

    // Two-tier blocker rule: any non-creating provider row must declare a
    // resolvable base_model (reuses tier validation against the canonical
    // lab set).
    for v in validate_tiers(entries, known_labs) {
        findings.push(GateFinding { severity: Severity::Error, message: v });
    }

    findings
}

/// Does the baseline pass the gate (errors only; warnings are advisory)?
pub fn gate_passes(findings: &[GateFinding]) -> bool {
    !findings.iter().any(|f| f.severity == Severity::Error)
}

/// The refresh plan one sync run would execute (documented, never executed
/// here): for each module → fetch its provider rows → run the gate on the
/// merged result → write the vendored baseline. Returns the plan steps so
/// the maintenance loop can report what it did.
pub fn refresh_plan() -> Vec<String> {
    SYNC_MODULES
        .iter()
        .map(|s| format!("fetch {} from {} → gate → merge baseline", s.provider, s.source))
        .collect()
}

/// The canonical writable field set any sync module may touch (the schema
/// contract — a module that tries to write beyond this is a bug).
pub const CANONICAL_WRITABLE_FIELDS: &[&str] = &[
    "pricing",
    "top_provider",
    "supported_parameters",
    "context_length",
    "knowledge_cutoff",
];

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, context: u64, prompt: f64, completion: f64) -> ModelEntry {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "context_length": context,
            "pricing": { "prompt": prompt, "completion": completion },
            "top_provider": { "context_length": context },
        }))
        .unwrap()
    }

    #[test]
    fn gate_accepts_a_clean_baseline() {
        let entries = vec![
            entry("anthropic/claude-opus-4-6", 200_000, 1e-5, 1e-4),
            entry("openai/gpt-5", 128_000, 1e-5, 1e-4),
        ];
        let findings = validate_vendored(&entries, &["anthropic/claude-opus-4-6", "openai/gpt-5"]);
        assert!(gate_passes(&findings), "{findings:?}");
    }

    #[test]
    fn gate_catches_duplicates_negatives_and_empties() {
        let entries = vec![
            entry("", 200_000, 1e-5, 1e-4),                       // empty id
            entry("x/a", 0, 1e-5, 1e-4),                          // no context
            entry("x/b", 10_000, -1.0, 1e-4),                     // negative price
            entry("y/c", 10_000, 1e-5, 1e-4),                     // fine
            entry("y/c", 10_000, 1e-5, 1e-4),                     // duplicate id
            entry("x/a", 200_000, 1e-5, 1e-4),                    // dup of x/a (dup context)
        ];
        let findings = validate_vendored(&entries, &[]);
        assert!(!gate_passes(&findings));
        let msgs: Vec<&str> = findings.iter().map(|f| f.message.as_str()).collect();
        assert!(msgs.iter().any(|m| m.contains("empty id")));
        assert!(msgs.iter().any(|m| m.contains("negative pricing")));
        assert!(msgs.iter().any(|m| m.contains("no context length")));
        assert!(msgs.iter().any(|m| m.contains("duplicate id")));
    }

    #[test]
    fn blocker_rule_is_part_of_the_gate() {
        // a row that is not a lab model (base_model None) and not in the lab
        // set must be flagged — the gate refuses a provider override without
        // a base_model.
        let entries = vec![entry("bedrock/claude-x", 200_000, 1e-5, 1e-4)];
        // the canonical lab set says `bedrock/claude-x` is not a lab model
        let findings = validate_vendored(&entries, &["anthropic/claude-opus-4-6"]);
        assert!(!gate_passes(&findings));
        assert!(findings.iter().any(|f| f.message.contains("base_model")));
    }

    #[test]
    fn modules_cover_the_top_providers() {
        let providers: Vec<&str> = SYNC_MODULES.iter().map(|s| s.provider).collect();
        for p in ["anthropic", "openai", "google", "mistral", "deepseek"] {
            assert!(providers.contains(&p), "{p} missing from sync modules");
        }
        assert_eq!(refresh_plan().len(), SYNC_MODULES.len());
        for spec in SYNC_MODULES {
            for f in spec.writable_fields {
                assert!(
                    CANONICAL_WRITABLE_FIELDS.contains(f),
                    "`{}` writes `{f}` outside the canonical set",
                    spec.provider
                );
            }
        }
    }
}
