//! Graph backend (C6, Algorithm #30/#6 — doc 07, doc 34 §2, doc 46 Graphiti).
//!
//! A Rust-native adjacency store implementing the LadybugDB schema
//! (`EntityNode`/`EpisodicNode` + typed `supports`/`contradicts`/`derived-from`
//! edges), temporal edge-versioning (graphiti pattern), Spreading Activation
//! (Algorithm #6), and depth-capped graph queries (d=2, top-k=15). The backing
//! store is an in-memory adjacency list; LadybugDB (embedded graph, Kuzu fork —
//! validated doc 54) remains the swap-in backend for the same schema when the
//! C++ FFI is wired.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

pub const DEFAULT_MAX_DEPTH: usize = 2;
pub const DEFAULT_TOP_K: usize = 15;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    Entity,
    Episodic,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EdgeType {
    Supports,
    Contradicts,
    DerivedFrom,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Edge {
    pub src: String,
    pub dst: String,
    pub ty: EdgeType,
    pub weight: f64,
    /// Temporal edge-versioning (graphiti pattern): the half-open window
    /// `[valid_from, valid_to]` during which this edge version is active.
    pub valid_from: u64,
    pub valid_to: u64,
}

impl Edge {
    fn is_valid_at(&self, at_time: u64) -> bool {
        self.valid_from <= at_time && at_time <= self.valid_to
    }
}

#[derive(Debug, Clone, Default)]
pub struct GraphStore {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    node_index: HashMap<String, usize>,
    out_index: HashMap<String, Vec<usize>>,
    #[allow(dead_code)]
    in_index: HashMap<String, Vec<usize>>,
}

impl GraphStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    pub fn add_node(&mut self, id: &str, kind: NodeKind, label: &str) {
        if self.node_index.contains_key(id) {
            return;
        }
        let idx = self.nodes.len();
        self.nodes.push(Node {
            id: id.to_string(),
            kind,
            label: label.to_string(),
        });
        self.node_index.insert(id.to_string(), idx);
    }

    /// Add an edge version at `at_time`, closing any prior open version of the
    /// same `(src, dst, ty)` (temporal edge-versioning).
    pub fn add_edge(
        &mut self,
        src: &str,
        dst: &str,
        ty: EdgeType,
        weight: f64,
        at_time: u64,
    ) -> usize {
        if let Some(idxs) = self.out_index.get(src) {
            for &ei in idxs {
                let e = &mut self.edges[ei];
                if e.dst == dst && e.ty == ty && e.is_valid_at(at_time) {
                    e.valid_to = at_time.saturating_sub(1).max(e.valid_from);
                }
            }
        }
        let ei = self.edges.len();
        self.edges.push(Edge {
            src: src.to_string(),
            dst: dst.to_string(),
            ty,
            weight,
            valid_from: at_time,
            valid_to: u64::MAX,
        });
        self.out_index.entry(src.to_string()).or_default().push(ei);
        self.in_index.entry(dst.to_string()).or_default().push(ei);
        ei
    }

    /// The active edge of type `ty` between `src` and `dst` at `at_time`.
    pub fn edge_between(&self, src: &str, dst: &str, ty: EdgeType, at_time: u64) -> Option<&Edge> {
        self.out_index.get(src).and_then(|idxs| {
            idxs.iter()
                .map(|&ei| &self.edges[ei])
                .find(|e| e.dst == dst && e.ty == ty && e.is_valid_at(at_time))
        })
    }

    /// Out-neighbors of `id` with active edges at `at_time`.
    pub fn neighbors(&self, id: &str, at_time: u64) -> Vec<(String, EdgeType, f64)> {
        self.out_index
            .get(id)
            .map(|idxs| {
                idxs.iter()
                    .filter_map(|&ei| {
                        let e = &self.edges[ei];
                        if e.is_valid_at(at_time) {
                            Some((e.dst.clone(), e.ty, e.weight))
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Spreading Activation (Algorithm #6): activation spreads from `sources`
    /// through active edges with per-hop decay; `contradicts` edges subtract.
    /// Returns the top-k activated nodes (sources included).
    pub fn spreading_activation(
        &self,
        sources: &[String],
        decay: f64,
        max_depth: usize,
        top_k: usize,
        at_time: u64,
    ) -> Vec<(String, f64)> {
        let mut activation: HashMap<String, f64> = HashMap::new();
        let mut frontier: Vec<(String, f64)> = sources.iter().map(|s| (s.clone(), 1.0)).collect();
        for (id, a) in &frontier {
            *activation.entry(id.clone()).or_insert(0.0) += a;
        }

        for _ in 0..max_depth {
            let mut next: HashMap<String, f64> = HashMap::new();
            for (src, a) in &frontier {
                for (dst, ty, w) in self.neighbors(src, at_time) {
                    let sign = if ty == EdgeType::Contradicts {
                        -1.0
                    } else {
                        1.0
                    };
                    *next.entry(dst).or_insert(0.0) += a * w * decay * sign;
                }
            }
            if next.is_empty() {
                break;
            }
            // Lateral inhibition: negative activation never accumulates.
            for (id, v) in &next {
                if *v > 0.0 {
                    *activation.entry(id.clone()).or_insert(0.0) += v;
                }
            }
            frontier = next.into_iter().collect();
        }

        let mut out: Vec<(String, f64)> =
            activation.into_iter().filter(|(_, v)| *v > 0.0).collect();
        out.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(Ordering::Equal)
                .then_with(|| a.0.cmp(&b.0))
        });
        out.truncate(top_k);
        out
    }

    /// Depth-capped BFS over active edges (default d=2).
    pub fn query_depth(
        &self,
        source: &str,
        max_depth: usize,
        at_time: u64,
    ) -> Vec<(String, usize)> {
        let mut visited: HashSet<String> = HashSet::new();
        let mut out = Vec::new();
        let mut frontier = vec![source.to_string()];
        visited.insert(source.to_string());

        for depth in 0..max_depth {
            let mut next = Vec::new();
            for src in &frontier {
                for (dst, _, _) in self.neighbors(src, at_time) {
                    if visited.insert(dst.clone()) {
                        out.push((dst.clone(), depth + 1));
                        next.push(dst);
                    }
                }
            }
            frontier = next;
            if frontier.is_empty() {
                break;
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_and_typed_edges() {
        let mut g = GraphStore::new();
        g.add_node("rust", NodeKind::Entity, "Rust");
        g.add_node("memory", NodeKind::Entity, "Memory");
        g.add_node("ep1", NodeKind::Episodic, "session");
        g.add_edge("ep1", "rust", EdgeType::Supports, 1.0, 0);
        g.add_edge("rust", "memory", EdgeType::DerivedFrom, 0.5, 0);
        g.add_edge("ep1", "memory", EdgeType::Contradicts, 1.0, 0);
        assert_eq!(g.node_count(), 3);
        assert_eq!(g.edge_count(), 3);
        assert!(g
            .edge_between("rust", "memory", EdgeType::DerivedFrom, 0)
            .is_some());
    }

    #[test]
    fn temporal_edge_versioning_closes_old() {
        let mut g = GraphStore::new();
        g.add_node("a", NodeKind::Entity, "A");
        g.add_node("b", NodeKind::Entity, "B");
        g.add_edge("a", "b", EdgeType::Supports, 1.0, 10);
        // New version supersedes the old one at t=20.
        g.add_edge("a", "b", EdgeType::Supports, 2.0, 20);
        assert_eq!(g.edge_count(), 2);
        let at_15 = g.edge_between("a", "b", EdgeType::Supports, 15).unwrap();
        assert_eq!(at_15.weight, 1.0);
        let at_25 = g.edge_between("a", "b", EdgeType::Supports, 25).unwrap();
        assert_eq!(at_25.weight, 2.0);
    }

    #[test]
    fn spreading_activation_decays_and_ranks() {
        let mut g = GraphStore::new();
        g.add_node("src", NodeKind::Entity, "S");
        g.add_node("n1", NodeKind::Entity, "N1");
        g.add_node("n2", NodeKind::Entity, "N2");
        g.add_edge("src", "n1", EdgeType::Supports, 1.0, 0);
        g.add_edge("src", "n2", EdgeType::Supports, 0.5, 0);
        g.add_edge("n1", "n2", EdgeType::Supports, 1.0, 0);

        let acts = g.spreading_activation(&["src".to_string()], 0.5, 2, 15, 0);
        // src=1.0, n1=0.5, n2 = direct(0.25) + via n1(0.25) = 0.5
        let get = |id: &str| {
            acts.iter()
                .find(|(i, _)| i == id)
                .map(|(_, a)| *a)
                .unwrap_or(0.0)
        };
        assert!((get("src") - 1.0).abs() < 1e-9);
        assert!((get("n1") - 0.5).abs() < 1e-9);
        assert!((get("n2") - 0.5).abs() < 1e-9);
    }

    #[test]
    fn contradiction_subtracts() {
        let mut g = GraphStore::new();
        g.add_node("s", NodeKind::Entity, "S");
        g.add_node("x", NodeKind::Entity, "X");
        g.add_edge("s", "x", EdgeType::Contradicts, 1.0, 0);
        let acts = g.spreading_activation(&["s".to_string()], 0.5, 1, 15, 0);
        // x gets negative activation → filtered out (only s remains).
        assert_eq!(acts.len(), 1);
        assert_eq!(acts[0].0, "s");
    }

    #[test]
    fn depth_cap_query() {
        let mut g = GraphStore::new();
        g.add_node("root", NodeKind::Entity, "R");
        g.add_node("d1", NodeKind::Entity, "1");
        g.add_node("d2", NodeKind::Entity, "2");
        g.add_node("d3", NodeKind::Entity, "3");
        g.add_edge("root", "d1", EdgeType::Supports, 1.0, 0);
        g.add_edge("d1", "d2", EdgeType::Supports, 1.0, 0);
        g.add_edge("d2", "d3", EdgeType::Supports, 1.0, 0);

        let d2 = g.query_depth("root", 2, 0);
        assert!(d2.iter().any(|(id, _)| id == "d1"));
        assert!(d2.iter().any(|(id, _)| id == "d2"));
        assert!(!d2.iter().any(|(id, _)| id == "d3"));
    }
}
