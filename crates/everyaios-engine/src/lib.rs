//! `everyaios-engine` — Rust port slice of the TS `ConversationEngine`
//! (packages/core-engine/src/*).
//!
//! Item-6 scope, stated honestly: the full engine is 542 LOC of TS but it
//! drives an async streaming loop (yield → provider calls → tool execution)
//! that the coordinator overrides with its own local `StreamSession`. Porting
//! that *loop* faithfully (and keeping 302 coordinator tests green) is a
//! separate multi-thousand-line effort, not something to bolt on blindly.
//!
//! What **is** ported here — and is fully deterministic + LLM-free — is the
//! **pure stage pipeline** the engine runs *around* the stream:
//!   - [`contract`] — `defaultContract(surface)` (surface-contract.ts)
//!   - [`plan`]     — RetrievalPlanner + ToolPlanner (stages/)
//!   - [`risk`]     — Algorithm #8 Evidence Grounding Score (v3.59 rename of
//!     "Hallucination Risk Compass", risk-compass.ts), score contract exactly
//!     mirrored from the TS tests.
//!   - [`gate`]     — PermissionGate (`evaluatePermissionGate`, Algorithm #12) + the
//!     per-session approval map.
//!
//! Everything here is idempotent, unit-testable without a model, and matches
//! the TS scoring so the port can be diffed against the reference.

use serde::Serialize;

// Re-export submodules.
pub mod gate;
pub mod plan;
pub mod risk;

// ---------------------------------------------------------------------------
// Surfaces + contracts (mirrors packages/core-engine/src/surface-contract.ts)
// ---------------------------------------------------------------------------

/// Surface kinds the engine serves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SurfaceKind {
    Chat,
    Reader,
    Bubble,
    Automation,
}

/// A scope for retrieval (mirrors core-domain Scope — ported as a plain enum).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    None,
    SourceHard { source_id: String },
    Project { project_id: String },
    Sources { source_ids: Vec<String> },
}

/// Tool families (mirrors types.ts ToolFamily).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ToolFamily {
    Knowledge,
    Reader,
    Automations,
    Creation,
    System,
}

/// The resolved surface contract the engine runs a turn under.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SurfaceContract {
    pub surface: SurfaceKind,
    pub scope: Scope,
    pub tool_mounts: Vec<ToolFamily>,
    pub max_output_tokens: usize,
    pub allow_artifacts: bool,
    pub allow_memory_writes: bool,
}

/// `defaultContract(surface)` — same mounts/tokens the TS helper returns.
pub fn default_contract(surface: SurfaceKind) -> SurfaceContract {
    match surface {
        SurfaceKind::Chat => SurfaceContract {
            surface,
            scope: Scope::None,
            tool_mounts: vec![
                ToolFamily::Knowledge,
                ToolFamily::Automations,
                ToolFamily::Creation,
                ToolFamily::System,
            ],
            max_output_tokens: 4096,
            allow_artifacts: true,
            allow_memory_writes: true,
        },
        SurfaceKind::Reader => SurfaceContract {
            surface,
            scope: Scope::SourceHard {
                source_id: String::new(),
            },
            tool_mounts: vec![ToolFamily::Reader, ToolFamily::System],
            max_output_tokens: 2048,
            allow_artifacts: false,
            allow_memory_writes: true,
        },
        SurfaceKind::Bubble => SurfaceContract {
            surface,
            scope: Scope::None,
            tool_mounts: vec![ToolFamily::System],
            max_output_tokens: 512,
            allow_artifacts: false,
            allow_memory_writes: false,
        },
        SurfaceKind::Automation => SurfaceContract {
            surface,
            scope: Scope::None,
            tool_mounts: vec![
                ToolFamily::Knowledge,
                ToolFamily::Reader,
                ToolFamily::System,
            ],
            max_output_tokens: 2048,
            allow_artifacts: false,
            allow_memory_writes: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_mounts_knowledge_automations_creation_system() {
        let c = default_contract(SurfaceKind::Chat);
        assert_eq!(c.max_output_tokens, 4096);
        assert!(c.allow_artifacts);
        assert!(c.allow_memory_writes);
        assert_eq!(
            c.tool_mounts,
            vec![
                ToolFamily::Knowledge,
                ToolFamily::Automations,
                ToolFamily::Creation,
                ToolFamily::System
            ]
        );
    }

    #[test]
    fn reader_is_source_hard_and_min_mounts() {
        let c = default_contract(SurfaceKind::Reader);
        assert_eq!(
            c.scope,
            Scope::SourceHard {
                source_id: String::new()
            }
        );
        assert_eq!(c.tool_mounts, vec![ToolFamily::Reader, ToolFamily::System]);
        assert!(!c.allow_artifacts);
    }

    #[test]
    fn bubble_is_minimal() {
        let c = default_contract(SurfaceKind::Bubble);
        assert_eq!(c.max_output_tokens, 512);
        assert_eq!(c.tool_mounts, vec![ToolFamily::System]);
        assert!(!c.allow_memory_writes);
    }
}
