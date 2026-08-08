//! everyaios-mcp — MCP server exposing the browser + connector tools
//! (ARCH/08 §8.6, F6/F7).
//!
//! P0.1 scope: the **17-tool catalog** (names/semantics identical to
//! BrowserOS so prompts & skills transfer — ARCH/02 §2.4) plus the ACP
//! tool-kind taxonomy (F9, doc 45 §4.3). P6.7 implements the server over
//! the official `modelcontextprotocol/rust-sdk` (stateless Streamable HTTP,
//! MCP 2026-07-28 spec: no initialize handshake, no Mcp-Session-Id).

use serde::{Deserialize, Serialize};

/// ACP tool-kind taxonomy (F9 — doc 45 §4.3): a shared vocabulary that maps
/// onto our F9 permission classes.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolKind {
    Read,
    Edit,
    Delete,
    Move,
    Search,
    Execute,
    Think,
    Fetch,
    Other,
}

/// One registered tool.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolDef {
    pub name: &'static str,
    pub kind: ToolKind,
    /// readOnlyHint annotation (MCP): true = never mutates.
    pub read_only: bool,
    /// openWorldHint annotation: true = may reach outside the workspace
    /// (run/evaluate are open-world and always permission-checked).
    pub open_world: bool,
}

impl ToolDef {
    pub const fn new(
        name: &'static str,
        kind: ToolKind,
        read_only: bool,
        open_world: bool,
    ) -> Self {
        Self {
            name,
            kind,
            read_only,
            open_world,
        }
    }
}

/// The 17-tool browser catalog (ARCH/02 §2.4):
/// tabs · tab_groups · history · navigate · snapshot · diff · act ·
/// download · upload · read · grep · screenshot · pdf · wait · windows ·
/// evaluate · run
pub const BROWSER_TOOLS: &[ToolDef] = &[
    ToolDef::new("tabs", ToolKind::Read, true, false),
    ToolDef::new("tab_groups", ToolKind::Read, true, false),
    ToolDef::new("history", ToolKind::Read, true, false),
    ToolDef::new("navigate", ToolKind::Edit, false, false),
    ToolDef::new("snapshot", ToolKind::Read, true, false),
    ToolDef::new("diff", ToolKind::Read, true, false),
    ToolDef::new("act", ToolKind::Edit, false, false),
    ToolDef::new("download", ToolKind::Edit, false, false),
    ToolDef::new("upload", ToolKind::Edit, false, false),
    ToolDef::new("read", ToolKind::Read, true, false),
    ToolDef::new("grep", ToolKind::Search, true, false),
    ToolDef::new("screenshot", ToolKind::Read, true, false),
    ToolDef::new("pdf", ToolKind::Read, true, false),
    ToolDef::new("wait", ToolKind::Other, false, false),
    ToolDef::new("windows", ToolKind::Read, true, false),
    ToolDef::new("evaluate", ToolKind::Execute, false, true),
    ToolDef::new("run", ToolKind::Execute, false, true),
];

/// Look up a tool by name.
pub fn find_tool(name: &str) -> Option<&'static ToolDef> {
    BROWSER_TOOLS.iter().find(|t| t.name == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_exactly_17_tools() {
        assert_eq!(BROWSER_TOOLS.len(), 17);
    }

    #[test]
    fn names_match_browseros_semantics() {
        let names: Vec<&str> = BROWSER_TOOLS.iter().map(|t| t.name).collect();
        assert_eq!(
            names,
            vec![
                "tabs",
                "tab_groups",
                "history",
                "navigate",
                "snapshot",
                "diff",
                "act",
                "download",
                "upload",
                "read",
                "grep",
                "screenshot",
                "pdf",
                "wait",
                "windows",
                "evaluate",
                "run"
            ]
        );
    }

    #[test]
    fn read_tools_annotated_read_only() {
        assert!(find_tool("snapshot").unwrap().read_only);
        assert!(find_tool("read").unwrap().read_only);
        assert!(!find_tool("act").unwrap().read_only);
    }

    #[test]
    fn execute_tools_are_open_world() {
        assert!(find_tool("run").unwrap().open_world);
        assert!(find_tool("evaluate").unwrap().open_world);
        assert!(!find_tool("navigate").unwrap().open_world);
    }

    #[test]
    fn every_tool_has_an_acp_kind() {
        for t in BROWSER_TOOLS {
            // ToolKind is non-unit; presence is the assertion.
            let _kind = t.kind;
        }
    }
}
