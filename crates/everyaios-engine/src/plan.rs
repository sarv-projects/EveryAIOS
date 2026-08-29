//! Planner stages — port of stages/retrieval-planner.ts + tool-planner.ts.
//!
//! Both are pure: given a surface contract + per-turn input (+ optional agent
//! sandbox overrides), they produce the retrieval plan and the allowed-tool
//! plan the engine feeds to the model. No IO, LLM-free.

use crate::{Scope, SurfaceContract, ToolFamily};

/// Input to retrieval planning (mirrors engine.ts retrievalInput).
#[derive(Debug, Clone, Default)]
pub struct RetrievalInput {
    pub include_web: Option<bool>,
    pub include_memory: Option<bool>,
    pub scope_file_ids: Option<Vec<String>>,
    pub open_document_id: Option<String>,
    pub project_id: Option<String>,
}

/// Output of RetrievalPlanner.plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetrievalPlan {
    pub scope: Scope,
    pub max_results: usize,
    pub include_web: bool,
    pub include_memory: bool,
    pub include_connectors: bool,
}

/// Agent sandbox overrides applied to planning (types.ts AgentSandbox).
#[derive(Debug, Clone, Default)]
pub struct AgentSandboxPlan {
    pub tool_ids: Option<Vec<String>>,
    pub web_access: Option<bool>,
    pub memory_scope: Option<MemoryScope>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemoryScope {
    Full,
    Project,
    None,
}

/// RetrievalPlanner.plan — resolved scope + hard web/memory gates.
pub fn plan_retrieval(
    contract: &SurfaceContract,
    input: &RetrievalInput,
    sandbox: &AgentSandboxPlan,
) -> RetrievalPlan {
    let scope: Scope = if contract.surface == crate::SurfaceKind::Reader
        && input.open_document_id.is_some()
    {
        Scope::SourceHard {
            source_id: input.open_document_id.clone().unwrap_or_default(),
        }
    } else if let Some(pid) = &input.project_id {
        Scope::Project {
            project_id: pid.clone(),
        }
    } else if let Some(ids) = &input.scope_file_ids {
        if !ids.is_empty() {
            Scope::Sources {
                source_ids: ids.clone(),
            }
        } else {
            Scope::None
        }
    } else {
        Scope::None
    };

    let surface_allows_web = input.include_web.unwrap_or_else(|| {
        contract.tool_mounts.contains(&ToolFamily::Knowledge)
    });
    let include_web = if sandbox.web_access == Some(false) {
        false
    } else {
        surface_allows_web
    };

    let surface_allows_memory = input.include_memory.unwrap_or(true);
    let include_memory = if sandbox.memory_scope == Some(MemoryScope::None) {
        false
    } else {
        surface_allows_memory
    };

    RetrievalPlan {
        scope,
        max_results: 8,
        include_web,
        include_memory,
        include_connectors: false,
    }
}

/// Canonical tool ids per family (mirrors tool-planner.ts FAMILY_TO_TOOLS).
pub fn family_to_tools(family: ToolFamily) -> &'static [&'static str] {
    match family {
        ToolFamily::Knowledge => &[
            "search_local_files",
            "search_current_project",
            "search_chat_history",
            "read_memory",
            "propose_memory",
            "search_web",
            "fetch_web_page",
        ],
        ToolFamily::Reader => &[
            "search_current_document",
            "get_document_page",
            "create_highlight",
            "create_note",
            "extract_table",
            "translate_selection",
            "explain_selection",
        ],
        ToolFamily::Automations => &[
            "draft_automation",
            "create_automation",
            "run_automation",
            "list_automations",
            "schedule_automation",
        ],
        ToolFamily::Creation => &["create_markdown", "create_docx", "create_pdf", "export_chat"],
        ToolFamily::System => &[
            "get_device_status",
            "get_current_time",
            "request_permission",
            "open_full_app",
        ],
    }
}

/// ToolPlan — the mounted families + the flattened allowed ids.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolPlan {
    pub mounted_families: Vec<ToolFamily>,
    pub allowed_tool_ids: Vec<String>,
}

/// ToolPlanner.plan — mount tools for the surface × agent sandbox.
pub fn plan_tools(
    contract: &SurfaceContract,
    agent_tool_ids: &Option<Vec<String>>,
) -> ToolPlan {
    let mut mounted = contract.tool_mounts.clone();
    mounted.dedup();
    let mut allowed: Vec<String> = Vec::new();
    for family in &mounted {
        for id in family_to_tools(*family) {
            allowed.push(id.to_string());
        }
    }
    // Intersect with agent sandbox toolIds if provided (per-agent access).
    if let Some(ids) = agent_tool_ids {
        if !ids.is_empty() {
            allowed.retain(|id| ids.contains(id));
        }
    }
    ToolPlan {
        mounted_families: mounted,
        allowed_tool_ids: allowed,
    }
}

/// familyOf(toolId) — which family owns a tool id, if any.
pub fn family_of(tool_id: &str) -> Option<ToolFamily> {
    use ToolFamily::*;
    const FAMILIES: [ToolFamily; 5] = [Knowledge, Reader, Automations, Creation, System];
    FAMILIES
        .iter()
        .copied()
        .find(|&f| family_to_tools(f).contains(&tool_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{default_contract, SurfaceKind};

    #[test]
    fn chat_retrieval_defaults() {
        let contract = default_contract(SurfaceKind::Chat);
        let p = plan_retrieval(&contract, &RetrievalInput::default(), &AgentSandboxPlan::default());
        assert_eq!(p.max_results, 8);
        assert!(p.include_web); // chat mounts knowledge
        assert!(p.include_memory);
        assert_eq!(p.scope, Scope::None);
    }

    #[test]
    fn web_access_false_blocks_web() {
        let contract = default_contract(SurfaceKind::Chat);
        let p = plan_retrieval(
            &contract,
            &RetrievalInput::default(),
            &AgentSandboxPlan {
                web_access: Some(false),
                ..Default::default()
            },
        );
        assert!(!p.include_web);
    }

    #[test]
    fn memory_scope_none_blocks_memory() {
        let contract = default_contract(SurfaceKind::Chat);
        let p = plan_retrieval(
            &contract,
            &RetrievalInput::default(),
            &AgentSandboxPlan {
                memory_scope: Some(MemoryScope::None),
                ..Default::default()
            },
        );
        assert!(!p.include_memory);
    }

    #[test]
    fn reader_open_document_is_source_hard() {
        let contract = default_contract(SurfaceKind::Reader);
        let p = plan_retrieval(
            &contract,
            &RetrievalInput {
                open_document_id: Some("doc-1".into()),
                ..Default::default()
            },
            &AgentSandboxPlan::default(),
        );
        assert_eq!(p.scope, Scope::SourceHard { source_id: "doc-1".into() });
    }

    #[test]
    fn tool_plan_mounts_and_filters() {
        let contract = default_contract(SurfaceKind::Chat);
        let plan = plan_tools(&contract, &None);
        assert!(plan.allowed_tool_ids.contains(&"search_web".to_string()));
        assert!(plan.allowed_tool_ids.contains(&"create_docx".to_string()));

        // Agent sandbox restricts to a subset.
        let restricted = plan_tools(
            &contract,
            &Some(vec!["search_local_files".to_string(), "nope".to_string()]),
        );
        assert_eq!(restricted.allowed_tool_ids, vec!["search_local_files".to_string()]);
    }

    #[test]
    fn family_of_resolves_known_and_unknown() {
        assert_eq!(family_of("create_pdf"), Some(ToolFamily::Creation));
        assert_eq!(family_of("list_automations"), Some(ToolFamily::Automations));
        assert_eq!(family_of("totally_unknown"), None);
    }
}