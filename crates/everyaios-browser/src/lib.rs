//! everyaios-browser — accessibility-tree snapshot engine (ARCH/08, E3).
//!
//! P2.2 scope: CDP Accessibility-domain capture (`capture::SnapshotEngine`),
//! interactive-mode pruning (~90% token cut), stable refs `[ref=eN]` scoped
//! to (document_id, url) (`tree`), iframe stitching inline and URL-change
//! short-circuit (`diff`).

pub mod actions;
pub mod ax;
pub mod capture;
pub mod diff;
pub mod ownership;
pub mod read;
pub mod tiers;
pub mod tree;

#[cfg(test)]
mod live_tests;

pub use actions::{
    find_ref, ActKind, ActResult, BrowserActions, EnhancedSnapshot, FieldValue, NavigateAction,
    Point, ReadMode, ScrollDirection, TextResult, WaitFor, WaitOutcome,
};
pub use ax::{AxNode, INTERACTIVE_ROLES};
pub use capture::{CdpSession, SnapshotEngine, MAX_FRAME_DEPTH};
pub use diff::{diff_snapshots, snapshot_lines};
pub use ownership::{OwnershipError, TabClaim, TabOwner, TabRecord, TabRegistry};
pub use read::{read_http, ReadOptions, ReadSource};
pub use tiers::{
    EngineConfig, EngineError, EngineResult, EngineTier, FetchIntent, LightEngine, TieredEngine,
};
pub use tree::{build_tree, RefMinter, TreeOptions};

use serde::{Deserialize, Serialize};

/// Snapshot verbosity (E3): `interactive` = actionables + headings only
/// (token-lean); `full` = complete tree with depth caps 1..=100.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotMode {
    Interactive,
    Full,
}

/// One node of the accessibility tree.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct A11yNode {
    pub role: String,
    pub name: String,
    /// Stable ref `eN`, scoped to (document_id, url).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ref_id: Option<String>,
    /// True for interactive elements (buttons, links, inputs).
    #[serde(default)]
    pub actionable: bool,
    /// Present on iframe placeholder nodes — the child frame's id, used by
    /// the snapshot engine to stitch child-frame trees inline.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame_id: Option<String>,
    /// The backing DOM node id (CDP `backendDOMNodeId`). Lets `act` resolve
    /// a `[ref=eN]` to geometry (`DOM.getBoxModel`) for click/type/hover.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend_dom_node_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<A11yNode>,
}

impl A11yNode {
    pub fn new(role: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            name: name.into(),
            ref_id: None,
            actionable: false,
            frame_id: None,
            backend_dom_node_id: None,
            children: Vec::new(),
        }
    }

    pub fn with_ref(mut self, ref_id: impl Into<String>) -> Self {
        self.ref_id = Some(ref_id.into());
        self
    }

    pub fn with_actionable(mut self) -> Self {
        self.actionable = true;
        self
    }

    pub fn with_frame_id(mut self, frame_id: impl Into<String>) -> Self {
        self.frame_id = Some(frame_id.into());
        self
    }

    pub fn with_backend_dom_node_id(mut self, id: i64) -> Self {
        self.backend_dom_node_id = Some(id);
        self
    }

    pub fn push(&mut self, child: A11yNode) {
        self.children.push(child);
    }

    /// Indented tree text — the exact token-lean form fed to the model.
    pub fn render(&self) -> String {
        let mut out = String::new();
        self.render_into(&mut out, 0);
        out
    }

    fn render_into(&self, out: &mut String, depth: usize) {
        let indent = "  ".repeat(depth);
        let ref_part = self
            .ref_id
            .as_ref()
            .map(|r| format!(" [ref={r}]"))
            .unwrap_or_default();
        out.push_str(&format!(
            "{indent}{} {}{}\n",
            self.role, self.name, ref_part
        ));
        for c in &self.children {
            c.render_into(out, depth + 1);
        }
    }
}

/// A captured snapshot of one document.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Snapshot {
    pub document_id: String,
    pub url: String,
    pub mode: SnapshotMode,
    pub root: A11yNode,
}

/// Line-diff between two snapshots (`+n/-n` markers, E3).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SnapshotDiff {
    pub base_document_id: String,
    pub base_url: String,
    pub added_lines: Vec<String>,
    pub removed_lines: Vec<String>,
    /// True when a navigation happened (URL change short-circuit → caller
    /// should return a full new snapshot instead of a diff).
    pub url_changed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tree() -> A11yNode {
        let mut root = A11yNode::new("dialog", "Sign in");
        let mut form = A11yNode::new("form", "");
        let email = A11yNode::new("textbox", "Email")
            .with_ref("e1")
            .with_actionable();
        let submit = A11yNode::new("button", "Continue")
            .with_ref("e2")
            .with_actionable();
        form.push(email);
        form.push(submit);
        root.push(form);
        root
    }

    #[test]
    fn tree_renders_indented_with_refs() {
        let text = sample_tree().render();
        assert!(text.contains("dialog Sign in"));
        assert!(text.contains("  form "));
        assert!(text.contains("    textbox Email [ref=e1]"));
        assert!(text.contains("    button Continue [ref=e2]"));
    }

    #[test]
    fn snapshot_modes_roundtrip() {
        let s = Snapshot {
            document_id: "doc-1".into(),
            url: "https://example.com".into(),
            mode: SnapshotMode::Interactive,
            root: sample_tree(),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: Snapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
        assert_eq!(back.mode, SnapshotMode::Interactive);
    }

    #[test]
    fn diff_marks_url_change() {
        let d = SnapshotDiff {
            base_document_id: "doc-1".into(),
            base_url: "https://a.example".into(),
            added_lines: vec!["+ h1 Welcome".into()],
            removed_lines: vec!["- button Old [ref=e9]".into()],
            url_changed: true,
        };
        assert!(d.url_changed);
        assert!(d.added_lines[0].starts_with('+'));
    }
}
