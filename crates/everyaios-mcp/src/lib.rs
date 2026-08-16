//! everyaios-mcp — MCP server exposing the browser + connector tools
//! (ARCH/08 §8.2/§8.6, F6/F7).
//!
//! P2.3 scope: the **37-tool catalog** — the 17 BrowserOS-compatible core
//! tools + `enhanced_snapshot` + bookmarks×6 + tab-groups×5 + windows×5
//! (34 total per ARCH/08 §8.2) + `file_ops`×3 workspace extension (E2).
//! Each tool carries the ACP tool-kind taxonomy (F9, doc 45 §4.3), MCP
//! readOnlyHint/openWorldHint annotations, a **tool profile** (doc 55
//! mcp.rs: core/network/state/debug/tabs/mobile), typed argument schemas,
//! and **extraArgs parity** (doc 55 — arbitrary extra args forwarded to the
//! action engine). Paginated discovery (doc 55) is implemented here;
//! P6.7 builds the actual server over the official rust-sdk.

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

/// Tool profiles (doc 55 mcp.rs): each profile is a curated tool subset a
/// client can request instead of the full catalog.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolProfile {
    Core,
    Network,
    State,
    Debug,
    Tabs,
    React,
    Mobile,
    /// Everything.
    All,
}

/// One typed argument of a tool (doc 55: typed args + extraArgs parity).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ArgDef {
    pub name: &'static str,
    pub kind: ArgKind,
    pub required: bool,
    pub description: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ArgKind {
    String,
    Number,
    Bool,
    StringArray,
    Object,
}

impl ArgDef {
    pub const fn new(
        name: &'static str,
        kind: ArgKind,
        required: bool,
        description: &'static str,
    ) -> Self {
        Self {
            name,
            kind,
            required,
            description,
        }
    }
}

/// One registered tool.
///
/// Note: not `Deserialize` — the catalog is a static registry; serialization
/// (for MCP discovery responses) uses `Serialize` only.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ToolDef {
    pub name: &'static str,
    pub kind: ToolKind,
    /// readOnlyHint annotation (MCP): true = never mutates.
    pub read_only: bool,
    /// openWorldHint annotation: true = may reach outside the workspace
    /// (run/evaluate are open-world and always permission-checked).
    pub open_world: bool,
    pub profile: ToolProfile,
    pub description: &'static str,
    pub args: &'static [ArgDef],
}

impl ToolDef {
    pub const fn new(
        name: &'static str,
        kind: ToolKind,
        read_only: bool,
        open_world: bool,
        profile: ToolProfile,
        description: &'static str,
        args: &'static [ArgDef],
    ) -> Self {
        Self {
            name,
            kind,
            read_only,
            open_world,
            profile,
            description,
            args,
        }
    }
}

// ---------------------------------------------------------------------------
// The 37-tool catalog
// ---------------------------------------------------------------------------

macro_rules! tools {
    ($( $name:literal, $kind:ident, $ro:literal, $ow:literal, $profile:ident, $desc:literal, $args:expr ),* $(,)?) => {
        &[
            $( ToolDef::new($name, ToolKind::$kind, $ro, $ow, ToolProfile::$profile, $desc, $args) ),*
        ]
    };
}

const STR_URL: ArgDef = ArgDef::new("url", ArgKind::String, true, "Page URL to navigate to");
const STR_REF: ArgDef = ArgDef::new(
    "ref_id",
    ArgKind::String,
    true,
    "Snapshot ref [ref=eN] to act on",
);
const STR_TEXT: ArgDef = ArgDef::new("text", ArgKind::String, false, "Text to type / wait for");
const STR_KEY: ArgDef = ArgDef::new(
    "key",
    ArgKind::String,
    true,
    "Keyboard key (Enter, Tab, Escape…)",
);
const STR_VALUE: ArgDef = ArgDef::new("value", ArgKind::String, false, "Select option value");
const STR_PATTERN: ArgDef = ArgDef::new("pattern", ArgKind::String, true, "Regex pattern");
const NUM_X: ArgDef = ArgDef::new("x", ArgKind::Number, true, "Viewport x (CSS px)");
const NUM_Y: ArgDef = ArgDef::new("y", ArgKind::Number, true, "Viewport y (CSS px)");
const NUM_MS: ArgDef = ArgDef::new("ms", ArgKind::Number, false, "Milliseconds to wait");
const NUM_QUALITY: ArgDef = ArgDef::new(
    "quality",
    ArgKind::Number,
    false,
    "JPEG quality 0-100 (default 80)",
);
const STR_SELECTOR: ArgDef = ArgDef::new("selector", ArgKind::String, true, "CSS selector");
const STR_EXPR: ArgDef = ArgDef::new(
    "expression",
    ArgKind::String,
    true,
    "JS expression to evaluate",
);
const STR_TITLE: ArgDef = ArgDef::new("title", ArgKind::String, true, "Bookmark title");
const STR_DIR: ArgDef = ArgDef::new("dir", ArgKind::String, false, "Download directory");
const ARR_FIELDS: ArgDef = ArgDef::new(
    "fields",
    ArgKind::Object,
    false,
    "Form fields [{ref_id, value}]",
);
const ARR_FILES: ArgDef = ArgDef::new("files", ArgKind::StringArray, true, "File paths to upload");
const STR_NAME: ArgDef = ArgDef::new("name", ArgKind::String, false, "Tab/group/window name");
const STR_ID: ArgDef = ArgDef::new("id", ArgKind::String, false, "Tab/group/window id");
const BOOL_HIDDEN: ArgDef = ArgDef::new("hidden", ArgKind::Bool, false, "Create hidden/background");
const STR_FILTER: ArgDef = ArgDef::new(
    "filter",
    ArgKind::String,
    false,
    "Keep lines matching regex",
);
const BOOL_OUTLINE: ArgDef = ArgDef::new("outline", ArgKind::Bool, false, "Headings + links only");
const BOOL_RAW: ArgDef = ArgDef::new("raw", ArgKind::Bool, false, "Raw text, no markdown syntax");
const STR_REF2: ArgDef = ArgDef::new("to_ref", ArgKind::String, false, "Drag target ref");
const STR_PATH: ArgDef = ArgDef::new("path", ArgKind::String, true, "Directory path to scan");
const STR_QUERY: ArgDef = ArgDef::new("query", ArgKind::String, true, "Filename search query");
const NUM_TOP_N: ArgDef = ArgDef::new("top_n", ArgKind::Number, false, "Number of results (default 50)");

/// The 37-tool catalog (ARCH/08 §8.2: 34 + file_ops×3). Ordering: the
/// original 17 BrowserOS-semantic tools first (prompts/skills transfer),
/// then enhanced_snapshot, bookmarks×6, tab-groups×5, windows×5, file_ops×3.
pub const BROWSER_TOOLS: &[ToolDef] = tools!(
    "tabs",
    Read,
    true,
    false,
    Tabs,
    "List open tabs/targets",
    &[],
    "tab_groups",
    Read,
    true,
    false,
    Tabs,
    "List tab groups (requires fork/extension surface)",
    &[],
    "history",
    Read,
    true,
    false,
    State,
    "Page navigation history",
    &[],
    "navigate",
    Edit,
    false,
    false,
    Core,
    "Goto / back / forward / reload",
    &[STR_URL],
    "snapshot",
    Read,
    true,
    false,
    State,
    "Accessibility snapshot with [ref=eN]",
    &[],
    "diff",
    Read,
    true,
    false,
    State,
    "Line-diff of two snapshots",
    &[],
    "act",
    Edit,
    false,
    false,
    Core,
    "Input: click/type/fill/press/hover/select/scroll/drag/dialog",
    &[STR_REF, STR_TEXT, STR_KEY, STR_VALUE, ARR_FIELDS, NUM_X, NUM_Y, STR_REF2],
    "download",
    Edit,
    false,
    false,
    Network,
    "Set download path / trigger download",
    &[STR_DIR],
    "upload",
    Edit,
    false,
    false,
    Network,
    "Set file input files by ref",
    &[STR_REF, ARR_FILES],
    "read",
    Read,
    true,
    false,
    Network,
    "Page → markdown (DOM walker / markdown negotiation)",
    &[STR_FILTER, BOOL_OUTLINE, BOOL_RAW],
    "grep",
    Search,
    true,
    false,
    Core,
    "Line matches in page text",
    &[STR_PATTERN],
    "screenshot",
    Read,
    true,
    false,
    Core,
    "JPEG screenshot (base64)",
    &[NUM_QUALITY],
    "pdf",
    Read,
    true,
    false,
    Core,
    "Print page to PDF (base64)",
    &[],
    "wait",
    Other,
    false,
    false,
    Core,
    "Wait for text/selector or ms",
    &[STR_TEXT, STR_SELECTOR, NUM_MS],
    "windows",
    Read,
    true,
    false,
    Tabs,
    "List browser windows",
    &[],
    "evaluate",
    Execute,
    false,
    true,
    Debug,
    "CDP Runtime.evaluate",
    &[STR_EXPR],
    "run",
    Execute,
    false,
    true,
    Debug,
    "Think-in-code script (P2.5 everyaios-script)",
    &[STR_EXPR],
    "enhanced_snapshot",
    Read,
    true,
    false,
    State,
    "Snapshot + paint-order occlusion filter",
    &[],
    // bookmarks ×6 — Chrome CDP has no bookmarks domain; these need the
    // fork/extension surface (BrowserOS ships them in the Chromium fork).
    "get_bookmarks",
    Read,
    true,
    false,
    Core,
    "List bookmarks",
    &[],
    "create_bookmark",
    Edit,
    false,
    false,
    Core,
    "Create bookmark",
    &[STR_TITLE, STR_URL],
    "remove_bookmark",
    Delete,
    false,
    false,
    Core,
    "Remove bookmark",
    &[STR_ID],
    "update_bookmark",
    Edit,
    false,
    false,
    Core,
    "Update bookmark",
    &[STR_ID, STR_TITLE, STR_URL],
    "move_bookmark",
    Move,
    false,
    false,
    Core,
    "Move bookmark",
    &[STR_ID, STR_ID],
    "search_bookmarks",
    Search,
    true,
    false,
    Core,
    "Search bookmarks",
    &[STR_TEXT],
    // tab-groups ×5 — no CDP surface on stock Chrome (fork/extension needed).
    "list_tab_groups",
    Read,
    true,
    false,
    Tabs,
    "List tab groups",
    &[],
    "group_tabs",
    Edit,
    false,
    false,
    Tabs,
    "Group tabs",
    &[STR_ID, STR_NAME],
    "update_tab_group",
    Edit,
    false,
    false,
    Tabs,
    "Update tab group",
    &[STR_ID, STR_NAME],
    "ungroup_tabs",
    Edit,
    false,
    false,
    Tabs,
    "Ungroup tabs",
    &[STR_ID],
    "close_tab_group",
    Delete,
    false,
    false,
    Tabs,
    "Close tab group",
    &[STR_ID],
    // windows ×5 — CDP Target/Browser domains.
    "list_windows",
    Read,
    true,
    false,
    Tabs,
    "List windows (targets grouped by context)",
    &[],
    "create_window",
    Edit,
    false,
    false,
    Tabs,
    "Create a new window",
    &[BOOL_HIDDEN],
    "create_hidden_window",
    Edit,
    false,
    false,
    Tabs,
    "Create a hidden background window",
    &[],
    "close_window",
    Delete,
    false,
    false,
    Tabs,
    "Close a window by context id",
    &[STR_ID],
    "activate_window",
    Edit,
    false,
    false,
    Tabs,
    "Activate/focus a window",
    &[STR_ID],
    // file_ops ×3 — OutputFileAccess routing (E2 extension).
    "save_pdf_enhanced",
    Read,
    true,
    false,
    Core,
    "Print to PDF and route to file",
    &[STR_DIR],
    "save_screenshot_enhanced",
    Read,
    true,
    false,
    Core,
    "JPEG screenshot routed to file",
    &[STR_DIR, NUM_QUALITY],
    "download_file",
    Edit,
    false,
    false,
    Network,
    "Download file to temp dir",
    &[STR_URL, STR_DIR],
);

/// The storage-intelligence tool catalog (P4.8 — D9–D11, G7): the
/// `everyaios-storage` primitives exposed as agent tools. All are **read-only
/// proposals** — the crate never deletes; cleanup goes through Guard-2.
/// Heavy scans respect J16 battery-awareness (the caller gates them).
pub const STORAGE_TOOLS: &[ToolDef] = tools!(
    "disk_scan",
    Read,
    true,
    false,
    State,
    "Scan a directory tree into an indexed arena (parallel work-stealing walker; battery-aware J16)",
    &[STR_PATH],
    "disk_duplicates",
    Search,
    true,
    false,
    State,
    "Find duplicate files (7-stage hash: size → xxHash3 → BLAKE3, hardlink-aware)",
    &[STR_PATH],
    "disk_large_files",
    Search,
    true,
    false,
    State,
    "Find largest files by size/age",
    &[STR_PATH, NUM_TOP_N],
    "disk_cleanup",
    Read,
    true,
    false,
    State,
    "Propose Guard-2-ticketed cleanup (recycle-bin-aware; NEVER deletes — proposal only)",
    &[STR_PATH],
    "filename_search",
    Search,
    true,
    false,
    State,
    "FTS5 filename search",
    &[STR_QUERY],
);

/// The unified agent tool registry: browser (37) + storage (5). This is what
/// the P6.x tool-catalog reconciliation exposes to the agent loop.
pub fn all_tools() -> Vec<&'static ToolDef> {
    BROWSER_TOOLS.iter().chain(STORAGE_TOOLS.iter()).collect()
}

/// Look up a browser tool by name.
pub fn find_tool(name: &str) -> Option<&'static ToolDef> {
    BROWSER_TOOLS.iter().find(|t| t.name == name)
}

/// Look up a storage tool by name.
pub fn find_storage_tool(name: &str) -> Option<&'static ToolDef> {
    STORAGE_TOOLS.iter().find(|t| t.name == name)
}

/// Tools belonging to a profile (doc 55: paginated discovery per profile).
pub fn tools_for_profile(profile: ToolProfile) -> Vec<&'static ToolDef> {
    BROWSER_TOOLS
        .iter()
        .filter(|t| profile == ToolProfile::All || t.profile == profile)
        .collect()
}

/// Paginated discovery: `page` is 0-based, `page_size` > 0. Returns the
/// slice for that page plus whether more pages follow (doc 55 mcp.rs).
pub fn paginate(
    tools: &[&'static ToolDef],
    page: usize,
    page_size: usize,
) -> (Vec<&'static ToolDef>, bool) {
    if page_size == 0 {
        return (Vec::new(), false);
    }
    let start = page * page_size;
    let end = (start + page_size).min(tools.len());
    let has_more = end < tools.len();
    let slice = tools.get(start..end).unwrap_or_default().to_vec();
    (slice, has_more)
}

/// extraArgs parity (doc 55): validate a call's args against the tool's
/// schema — required args present, unknown args allowed (forwarded).
pub fn validate_args(
    tool: &ToolDef,
    args: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    for a in tool.args {
        if a.required && !args.contains_key(a.name) {
            return Err(format!(
                "missing required arg '{}' for tool '{}'",
                a.name, tool.name
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn catalog_has_exactly_37_tools() {
        assert_eq!(BROWSER_TOOLS.len(), 37);
    }

    #[test]
    fn original_17_first_and_ordered() {
        let names: Vec<&str> = BROWSER_TOOLS.iter().map(|t| t.name).collect();
        assert_eq!(
            &names[..17],
            &[
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
    fn totals_per_group() {
        let names: Vec<&str> = BROWSER_TOOLS.iter().map(|t| t.name).collect();
        let bookmarks = names.iter().filter(|n| n.contains("bookmark")).count();
        // The 5 tab-group MANAGEMENT tools (excludes the original 17 `tab_groups`).
        let tab_groups = [
            "list_tab_groups",
            "group_tabs",
            "update_tab_group",
            "ungroup_tabs",
            "close_tab_group",
        ]
        .iter()
        .filter(|n| names.contains(n))
        .count();
        // The 5 window-MANAGEMENT tools (excludes the original 17 `windows`).
        let windows = [
            "list_windows",
            "create_window",
            "create_hidden_window",
            "close_window",
            "activate_window",
        ]
        .iter()
        .filter(|n| names.contains(n))
        .count();
        let file_ops = names
            .iter()
            .filter(|n| n.contains("save_") || n.contains("download_file"))
            .count();
        assert_eq!(bookmarks, 6);
        assert_eq!(tab_groups, 5);
        assert_eq!(windows, 5);
        assert_eq!(file_ops, 3);
    }

    #[test]
    fn names_are_unique() {
        let mut names: Vec<&str> = BROWSER_TOOLS.iter().map(|t| t.name).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), 37);
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
    fn every_tool_has_profile_and_kind() {
        for t in BROWSER_TOOLS {
            let _kind = t.kind;
            let _ = t.profile; // presence is the assertion
            assert!(!t.description.is_empty());
        }
    }

    #[test]
    fn profiles_subset_catalog() {
        let debug = tools_for_profile(ToolProfile::Debug);
        assert_eq!(debug.len(), 2); // evaluate + run
        assert!(debug.iter().all(|t| t.profile == ToolProfile::Debug));
        // React has no tools yet — empty profile is valid (doc 55 list parity).
        assert!(tools_for_profile(ToolProfile::React).is_empty());
        let all = tools_for_profile(ToolProfile::All);
        assert_eq!(all.len(), 37);
    }

    #[test]
    fn pagination_returns_pages_and_has_more() {
        let all = tools_for_profile(ToolProfile::All);
        let (p1, more1) = paginate(&all, 0, 10);
        assert_eq!(p1.len(), 10);
        assert!(more1);
        let (p4, more4) = paginate(&all, 3, 10);
        assert_eq!(p4.len(), 7);
        assert!(!more4);
        let (empty, _) = paginate(&all, 99, 10);
        assert!(empty.is_empty());
        let (_, has_more) = paginate(&all, 0, 0);
        assert!(!has_more);
    }

    #[test]
    fn typed_args_validate_required() {
        let nav = find_tool("navigate").unwrap();
        let mut args = serde_json::Map::new();
        assert!(validate_args(nav, &args).is_err());
        args.insert("url".into(), json!("https://example.com"));
        assert!(validate_args(nav, &args).is_ok());
        // extraArgs parity: unknown args pass through.
        args.insert("extraArg".into(), json!(42));
        assert!(validate_args(nav, &args).is_ok());
    }

    #[test]
    fn act_has_full_typed_args() {
        let act = find_tool("act").unwrap();
        let names: Vec<&str> = act.args.iter().map(|a| a.name).collect();
        assert!(names.contains(&"ref_id"));
        assert!(names.contains(&"fields"));
        assert!(names.contains(&"x"));
    }

    #[test]
    fn storage_catalog_has_5_tools() {
        assert_eq!(STORAGE_TOOLS.len(), 5);
        let names: Vec<&str> = STORAGE_TOOLS.iter().map(|t| t.name).collect();
        assert!(names.contains(&"disk_scan"));
        assert!(names.contains(&"disk_duplicates"));
        assert!(names.contains(&"disk_large_files"));
        assert!(names.contains(&"disk_cleanup"));
        assert!(names.contains(&"filename_search"));
    }

    #[test]
    fn storage_tools_are_read_only_proposals() {
        for t in STORAGE_TOOLS {
            assert!(t.read_only, "{} must be read-only (never deletes)", t.name);
        }
        assert!(find_storage_tool("disk_cleanup").unwrap().read_only);
    }

    #[test]
    fn all_tools_merges_browser_and_storage() {
        let all = all_tools();
        assert_eq!(all.len(), 37 + 5);
        // No name collision across the two catalogs.
        let mut names: Vec<&str> = all.iter().map(|t| t.name).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), 42);
    }
}
