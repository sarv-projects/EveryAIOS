//! A11y tree building + ref minting (P2.2, E3).
//!
//! Builds the indented `A11yNode` tree from the flat `AxNode` list returned
//! by `Accessibility.getFullAXTree`, applies the mode pruning (interactive =
//! actionables + headings, ~90% token cut; full = complete tree with depth
//! caps 1..=100), and mints stable `[ref=eN]` handles scoped to
//! (document_id, url) — refs never leak across navigations (ARCH/08 §8.3).

use crate::ax::{is_heading, is_interactive, AxNode};
use crate::A11yNode;
use std::collections::HashMap;

/// Default max depth for the tree render.
pub const DEFAULT_DEPTH_CAP: usize = 100;
/// Clamp bounds per ARCH/08 §8.3 (1..=100).
const MIN_DEPTH_CAP: usize = 1;
const MAX_DEPTH_CAP: usize = 100;

/// Ref minting scope: one counter per (document_id, url) — see
/// `RefMinter`. Handles are stable across turns for the same document+url.
#[derive(Debug, Default)]
pub struct RefMinter {
    next: u64,
}

impl RefMinter {
    pub fn new() -> Self {
        Self { next: 1 }
    }

    /// Mint the next stable ref `eN` (compact form `e1`, `e2`, …).
    pub fn fresh(&mut self) -> String {
        let n = self.next;
        self.next += 1;
        format!("e{n}")
    }
}

/// Options controlling tree construction.
#[derive(Debug, Clone, Copy)]
pub struct TreeOptions {
    pub mode: crate::SnapshotMode,
    /// Depth cap clamped into 1..=100.
    pub depth_cap: usize,
}

impl Default for TreeOptions {
    fn default() -> Self {
        Self {
            mode: crate::SnapshotMode::Interactive,
            depth_cap: DEFAULT_DEPTH_CAP,
        }
    }
}

impl TreeOptions {
    /// Clamp the requested depth into the legal 1..=100 range.
    pub fn with_depth_cap(mut self, cap: usize) -> Self {
        self.depth_cap = cap.clamp(MIN_DEPTH_CAP, MAX_DEPTH_CAP);
        self
    }
}

/// Build the domain `A11yNode` tree from flat AX nodes.
///
/// `nodes` are the parsed `Accessibility.getFullAXTree` nodes; `refs` is the
/// (document_id, url)-scoped minter. Nodes with no parent (not referenced by
/// any other node's childIds) become roots; the largest root (the WebArea)
/// is chosen as the tree root.
pub fn build_tree(
    nodes: &[AxNode],
    options: TreeOptions,
    refs: &mut RefMinter,
) -> Option<A11yNode> {
    if nodes.is_empty() {
        return None;
    }
    let index = AxNode::index(nodes);
    let roots = find_roots(nodes);
    let root_id = roots
        .into_iter()
        .max_by_key(|id| subtree_size(id, &index))
        .unwrap_or_else(|| nodes[0].node_id.clone());
    build_node(&root_id, &index, options, refs, 0)
}

fn find_roots(nodes: &[AxNode]) -> Vec<String> {
    let mut children_of: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for n in nodes {
        for c in &n.child_ids {
            children_of.insert(c.as_str());
        }
    }
    nodes
        .iter()
        .filter(|n| !children_of.contains(n.node_id.as_str()))
        .map(|n| n.node_id.clone())
        .collect()
}

fn subtree_size(id: &str, index: &HashMap<String, AxNode>) -> usize {
    let Some(node) = index.get(id) else {
        return 0;
    };
    1 + node
        .child_ids
        .iter()
        .map(|c| subtree_size(c, index))
        .sum::<usize>()
}

fn build_node(
    id: &str,
    index: &HashMap<String, AxNode>,
    options: TreeOptions,
    refs: &mut RefMinter,
    depth: usize,
) -> Option<A11yNode> {
    let node = index.get(id)?;
    if node.ignored || node.role.is_empty() {
        // Ignored nodes still pass through their children.
        if node.child_ids.is_empty() {
            return None;
        }
    }
    if depth >= options.depth_cap {
        return None;
    }

    let mut out = A11yNode::new(&node.role, &node.name);
    // Carry the child-frame id on iframe placeholder nodes so the capture
    // engine can stitch child frames inline.
    if node.role == "Iframe" || node.role == "iframe" {
        if let Some(fid) = &node.frame_id {
            out.frame_id = Some(fid.clone());
        }
    }
    // Full mode: keep everything. Interactive mode: prune to
    // actionables + headings + content, collapsing pure structure.
    // Iframe placeholders are always kept — the capture engine stitches the
    // child frame's tree into them after this pass.
    let is_iframe = node.role == "Iframe" || node.role == "iframe";
    let keep_self = match options.mode {
        crate::SnapshotMode::Full => true,
        crate::SnapshotMode::Interactive => {
            is_iframe || is_interactive(&node.role) || is_heading(&node.role)
        }
    };

    let mut kept_children: Vec<A11yNode> = Vec::new();
    for cid in &node.child_ids {
        if let Some(child) = build_node(cid, index, options, refs, depth + 1) {
            kept_children.push(child);
        }
    }

    if kept_children.is_empty() && !keep_self {
        return None;
    }
    // Collapse pure-structure chains: if a structural node has exactly one
    // kept child and no name of its own, fold the child up (agent-browser's
    // compact style) — but never fold an actionable or named element.
    if options.mode == crate::SnapshotMode::Interactive
        && !keep_self
        && !is_iframe
        && node.name.is_empty()
        && kept_children.len() == 1
    {
        return Some(kept_children.remove(0));
    }

    out.children = kept_children;
    if is_interactive(&node.role) {
        out.ref_id = Some(refs.fresh());
        out.actionable = true;
    }
    Some(out)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SnapshotMode;

    fn node(id: &str, role: &str, name: &str, children: &[&str]) -> AxNode {
        AxNode {
            node_id: id.into(),
            role: role.into(),
            name: name.into(),
            value: String::new(),
            focusable: false,
            ignored: false,
            child_ids: children.iter().map(|c| c.to_string()).collect(),
            backend_dom_node_id: None,
            frame_id: None,
            properties: Default::default(),
        }
    }

    fn fixture() -> Vec<AxNode> {
        vec![
            node("1", "WebArea", "Page title", &["2", "3"]),
            node("2", "heading", "Welcome", &[]),
            node("3", "generic", "", &["4", "5"]),
            node("4", "button", "Sign in", &[]),
            node("5", "paragraph", "Some text", &[]),
        ]
    }

    #[test]
    fn interactive_mode_keeps_actionables_and_headings() {
        let mut refs = RefMinter::new();
        let tree = build_tree(&fixture(), TreeOptions::default(), &mut refs).unwrap();
        let rendered = tree.render();
        assert!(rendered.contains("heading Welcome"), "{rendered}");
        assert!(rendered.contains("button Sign in [ref=e1]"), "{rendered}");
        // structural generic + plain paragraph pruned
        assert!(!rendered.contains("generic"), "{rendered}");
        assert!(!rendered.contains("paragraph"), "{rendered}");
    }

    #[test]
    fn full_mode_keeps_everything_with_depth_cap() {
        let opts = TreeOptions {
            mode: SnapshotMode::Full,
            ..Default::default()
        };
        let mut refs = RefMinter::new();
        let tree = build_tree(&fixture(), opts, &mut refs).unwrap();
        let rendered = tree.render();
        assert!(rendered.contains("generic"), "{rendered}");
        assert!(rendered.contains("paragraph Some text"), "{rendered}");
        assert!(rendered.contains("button Sign in [ref=e1]"), "{rendered}");
    }

    #[test]
    fn depth_cap_is_clamped_to_100() {
        let opts = TreeOptions::default().with_depth_cap(1000);
        assert_eq!(opts.depth_cap, 100);
        let opts2 = TreeOptions::default().with_depth_cap(0);
        assert_eq!(opts2.depth_cap, 1);
    }

    #[test]
    fn refs_mint_sequentially() {
        let mut refs = RefMinter::new();
        assert_eq!(refs.fresh(), "e1");
        assert_eq!(refs.fresh(), "e2");
        assert_eq!(refs.fresh(), "e3");
    }

    #[test]
    fn structural_chain_collapses() {
        // generic > button should collapse the generic wrapper.
        let nodes = vec![
            node("1", "WebArea", "", &["2"]),
            node("2", "generic", "", &["3"]),
            node("3", "button", "Go", &[]),
        ];
        let mut refs = RefMinter::new();
        let tree = build_tree(&nodes, TreeOptions::default(), &mut refs).unwrap();
        let rendered = tree.render();
        assert!(!rendered.contains("generic"), "{rendered}");
        assert!(rendered.contains("button Go [ref=e1]"), "{rendered}");
    }

    #[test]
    fn empty_input_returns_none() {
        let mut refs = RefMinter::new();
        assert!(build_tree(&[], TreeOptions::default(), &mut refs).is_none());
    }
}
