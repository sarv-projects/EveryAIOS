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

/// Open-ended time bound (an active window or an unrecorded-future fact).
pub const OPEN: u64 = u64::MAX;

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
    /// Valid-time window (graphiti pattern): the half-open period during
    /// which the entity is true/current. `OPEN` = still valid.
    pub valid_from: u64,
    pub valid_to: u64,
    /// Transaction time (bi-temporal): when this fact was recorded. A fact is
    /// only observable at/after its `recorded_at` — this is the second time
    /// axis bi-temporal tracking adds on top of valid time.
    pub recorded_at: u64,
}

impl Node {
    /// Build a node with a full temporal extent (valid for all time, recorded
    /// at `recorded_at`).
    pub fn new(id: &str, kind: NodeKind, label: &str) -> Self {
        Self {
            id: id.to_string(),
            kind,
            label: label.to_string(),
            valid_from: 0,
            valid_to: OPEN,
            recorded_at: 0,
        }
    }

    /// Is this entity valid at `valid_at` **and** recorded by `recorded_at`
    /// (bi-temporal observation: the fact must exist in the ledger by the
    /// time we query, and be true at the time we ask about).
    pub fn active_at(&self, valid_at: u64, recorded_at: u64) -> bool {
        self.valid_from <= valid_at && valid_at <= self.valid_to && self.recorded_at <= recorded_at
    }
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
    /// Transaction time (bi-temporal): when this edge fact was recorded.
    pub recorded_at: u64,
}

impl Edge {
    fn is_valid_at(&self, at_time: u64) -> bool {
        self.valid_from <= at_time && at_time <= self.valid_to
    }

    /// Bi-temporal: the edge is valid at `valid_at` **and** was recorded by
    /// `recorded_at`.
    fn is_active_at(&self, valid_at: u64, recorded_at: u64) -> bool {
        self.is_valid_at(valid_at) && self.recorded_at <= recorded_at
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
        self.add_node_at(id, kind, label, 0, 0);
    }

    /// Add a node with an explicit valid-time start and transaction-time
    /// (recorded) timestamp — the bi-temporal entry point.
    pub fn add_node_at(
        &mut self,
        id: &str,
        kind: NodeKind,
        label: &str,
        valid_from: u64,
        recorded_at: u64,
    ) {
        if self.node_index.contains_key(id) {
            return;
        }
        let idx = self.nodes.len();
        self.nodes.push(Node {
            id: id.to_string(),
            kind,
            label: label.to_string(),
            valid_from,
            valid_to: OPEN,
            recorded_at,
        });
        self.node_index.insert(id.to_string(), idx);
    }

    /// Close an entity's valid-time window at `valid_to` (it ceases to be
    /// true after that point, while older facts remain queryable via
    /// bi-temporal history).
    pub fn close_node(&mut self, id: &str, valid_to: u64) -> bool {
        if let Some(&idx) = self.node_index.get(id) {
            self.nodes[idx].valid_to = valid_to;
            true
        } else {
            false
        }
    }

    /// The node for `id`, if it is observable at the given (valid, recorded)
    /// time pair.
    pub fn node_active_at(&self, id: &str, valid_at: u64, recorded_at: u64) -> Option<&Node> {
        self.node_index
            .get(id)
            .map(|&i| &self.nodes[i])
            .filter(|n| n.active_at(valid_at, recorded_at))
    }

    /// Every node valid at `valid_at` and recorded by `recorded_at` (the
    /// bi-temporal snapshot of the entity set).
    pub fn nodes_active_at(&self, valid_at: u64, recorded_at: u64) -> Vec<&Node> {
        self.nodes
            .iter()
            .filter(|n| n.active_at(valid_at, recorded_at))
            .collect()
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
            valid_to: OPEN,
            recorded_at: 0,
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

    /// Bi-temporal edge lookup: the edge must be valid at `valid_at` **and**
    /// recorded by `recorded_at` (transaction-time gating).
    pub fn edge_between_at(
        &self,
        src: &str,
        dst: &str,
        ty: EdgeType,
        valid_at: u64,
        recorded_at: u64,
    ) -> Option<&Edge> {
        self.out_index.get(src).and_then(|idxs| {
            idxs.iter()
                .map(|&ei| &self.edges[ei])
                .find(|e| e.dst == dst && e.ty == ty && e.is_active_at(valid_at, recorded_at))
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

    #[test]
    fn node_validity_window_tracks_true_period() {
        let mut g = GraphStore::new();
        g.add_node_at("alice", NodeKind::Entity, "Alice", 10, 5);
        // Alice exists (recorded at 5), valid from t=10.
        assert!(g.node_active_at("alice", 10, 5).is_some());
        // Not yet true at t=9.
        assert!(g.node_active_at("alice", 9, 5).is_none());
        // Not observable before it was recorded at t=5.
        assert!(g.node_active_at("alice", 10, 4).is_none());
        // Close her validity window at t=20.
        assert!(g.close_node("alice", 20));
        assert!(g.node_active_at("alice", 20, 5).is_some());
        assert!(g.node_active_at("alice", 21, 5).is_none());
    }

    #[test]
    fn nodes_active_at_is_bi_temporal_snapshot() {
        let mut g = GraphStore::new();
        g.add_node_at("a", NodeKind::Entity, "A", 0, 0);
        g.add_node_at("b", NodeKind::Entity, "B", 5, 3); // recorded at 3
        g.add_node_at("c", NodeKind::Entity, "C", 0, 10); // recorded at 10
        // At (valid=5, recorded=5): a and b, but not c (recorded later).
        let snapshot = g.nodes_active_at(5, 5);
        let ids: Vec<&str> = snapshot.iter().map(|n| n.id.as_str()).collect();
        assert!(ids.contains(&"a"));
        assert!(ids.contains(&"b"));
        assert!(!ids.contains(&"c"));
        // At (valid=5, recorded=10): all three.
        let snapshot = g.nodes_active_at(5, 10);
        assert_eq!(snapshot.len(), 3);
    }

    #[test]
    fn edge_recorded_at_gates_observation() {
        let mut g = GraphStore::new();
        g.add_node("a", NodeKind::Entity, "A");
        g.add_node("b", NodeKind::Entity, "B");
        // Edge valid from t=0 but recorded later (bi-temporal: the
        // relationship is only observable after it is recorded).
        let ei = g.add_edge("a", "b", EdgeType::Supports, 1.0, 0);
        g.edges[ei].recorded_at = 7;
        assert!(g
            .edge_between("a", "b", EdgeType::Supports, 0)
            .unwrap()
            .is_active_at(0, 7));
        assert!(!g
            .edge_between("a", "b", EdgeType::Supports, 0)
            .unwrap()
            .is_active_at(0, 6));
    }

    #[test]
    fn close_node_unknown_returns_false() {
        let mut g = GraphStore::new();
        assert!(!g.close_node("ghost", 10));
    }
}
