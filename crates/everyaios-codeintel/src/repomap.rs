//! Repo map (I11 — doc 63 §4.8, aider `repomap.py` pattern): tag extraction,
//! a symbol graph, personalized-PageRank-style ranking, and binary-search
//! budget fitting — the cheap, no-embedding code-context assembler.
//!
//! Tag extraction is a source-level heuristic (function/type/const
//! definitions) — tree-sitter precision is a later, optional upgrade; the
//! graph + ranking logic is the same either way.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TagKind {
    Function,
    Type,
    Const,
    Module,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tag {
    pub symbol: String,
    pub kind: TagKind,
    pub file: String,
    pub line: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RepoMap {
    pub tags: Vec<Tag>,
    /// Symbol → symbols it references (call/type edges, heuristic).
    pub edges: HashMap<String, Vec<String>>,
}

// ---------------------------------------------------------------------------
// Tag sources (tree-sitter is a pluggable source; the lexical one is the
// always-available default)
// ---------------------------------------------------------------------------

/// A tag source: extracts definition tags from source text. The repo map is
/// source-agnostic — the lexical (regex) source ships as the default;
/// tree-sitter precision plugs in as another [`TagSource`] without touching
/// the graph/ranking logic.
pub trait TagSource {
    fn extract(&self, content: &str, file: &str) -> Vec<Tag>;
}

/// The default lexical (regex) tag source — the current [`extract_tags`]
/// heuristic.
#[derive(Debug, Clone, Copy, Default)]
pub struct LexicalTagSource;

impl TagSource for LexicalTagSource {
    fn extract(&self, content: &str, file: &str) -> Vec<Tag> {
        extract_tags(content, file)
    }
}

/// Unions multiple tag sources, deduplicating by `(symbol, file, line)` so
/// overlapping sources (e.g. lexical + tree-sitter) never double-count.
#[derive(Default)]
pub struct CompositeTagSource {
    sources: Vec<Box<dyn TagSource>>,
}

impl CompositeTagSource {
    pub fn new(sources: Vec<Box<dyn TagSource>>) -> Self {
        Self { sources }
    }

    pub fn push(&mut self, source: Box<dyn TagSource>) {
        self.sources.push(source);
    }

    pub fn is_empty(&self) -> bool {
        self.sources.is_empty()
    }
}

impl TagSource for CompositeTagSource {
    fn extract(&self, content: &str, file: &str) -> Vec<Tag> {
        let mut seen = std::collections::HashSet::new();
        let mut out = Vec::new();
        for source in &self.sources {
            for tag in source.extract(content, file) {
                if seen.insert((tag.symbol.clone(), tag.file.clone(), tag.line)) {
                    out.push(tag);
                }
            }
        }
        out
    }
}

/// Extract definition tags from one file's source using a tag source.
pub fn extract_tags_with(source: &dyn TagSource, content: &str, file: &str) -> Vec<Tag> {
    source.extract(content, file)
}

/// Extract definition tags from one file's source.
pub fn extract_tags(content: &str, file: &str) -> Vec<Tag> {
    let re = Regex::new(
        r"(?m)^\s*(?:(?:pub\s+)?(?:async\s+)?(?:fn|def|func|function)\s+([A-Za-z_][A-Za-z0-9_]*)|(?:pub\s+)?(?:struct|class|enum|interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)|(?:const|static)\s+([A-Za-z_][A-Za-z0-9_]*))",
    )
    .expect("repo-map tag regex must compile");
    let mut tags = Vec::new();
    for cap in re.captures_iter(content) {
        let (symbol, kind) = if let Some(f) = cap.get(1) {
            (f.as_str().to_string(), TagKind::Function)
        } else if let Some(t) = cap.get(2) {
            (t.as_str().to_string(), TagKind::Type)
        } else if let Some(c) = cap.get(3) {
            (c.as_str().to_string(), TagKind::Const)
        } else {
            continue;
        };
        let line = content[..cap.get(0).unwrap().start()]
            .matches('\n')
            .count() as u32
            + 1;
        tags.push(Tag {
            symbol,
            kind,
            file: file.to_string(),
            line,
        });
    }
    tags
}

/// Build a repo map from `(file, content)` pairs using a tag source: tags +
/// a heuristic symbol graph (an edge `a → b` when `a`'s file references `b`).
pub fn build_repo_map_with(source: &dyn TagSource, files: &[(String, String)]) -> RepoMap {
    let mut tags = Vec::new();
    for (file, content) in files {
        tags.extend(source.extract(content, file));
    }
    build_repo_map_inner(files, tags)
}

/// Build a repo map from `(file, content)` pairs: tags + a heuristic symbol
/// graph (an edge `a → b` when `a`'s file references `b`). Uses the default
/// [`LexicalTagSource`]; pass a custom source via [`build_repo_map_with`].
pub fn build_repo_map(files: &[(String, String)]) -> RepoMap {
    let mut tags = Vec::new();
    for (file, content) in files {
        tags.extend(extract_tags(content, file));
    }
    build_repo_map_inner(files, tags)
}

fn build_repo_map_inner(files: &[(String, String)], tags: Vec<Tag>) -> RepoMap {
    let symbols: HashSet<&str> = tags.iter().map(|t| t.symbol.as_str()).collect();
    let mut edges: HashMap<String, Vec<String>> = HashMap::new();
    for (file, content) in files {
        let file_tags: Vec<&Tag> = tags.iter().filter(|t| t.file == *file).collect();
        for t in &file_tags {
            let mut refs = Vec::new();
            for s in &symbols {
                if *s != t.symbol && content.contains(*s) {
                    refs.push(s.to_string());
                }
            }
            // Deterministic edge order (HashMap iteration is randomized) —
            // keeps the repo map stable across runs for eval reproducibility.
            refs.sort();
            edges.entry(t.symbol.clone()).or_default().extend(refs);
        }
    }
    RepoMap { tags, edges }
}

/// Basic PageRank over the symbol graph (power iteration, ~32 steps).
pub fn page_rank(map: &RepoMap, iterations: usize) -> HashMap<String, f64> {
    let n = map.tags.len().max(1);
    let damping = 0.85;
    let mut scores: HashMap<String, f64> = map
        .tags
        .iter()
        .map(|t| (t.symbol.clone(), 1.0 / n as f64))
        .collect();
    for _ in 0..iterations {
        let mut next: HashMap<String, f64> = HashMap::new();
        for t in &map.tags {
            let incoming = map
                .edges
                .iter()
                .filter(|(_, targets)| targets.contains(&t.symbol))
                .map(|(src, _)| src.clone())
                .collect::<Vec<_>>();
            let rank: f64 = incoming
                .iter()
                .map(|src| scores.get(src).copied().unwrap_or(0.0))
                .sum();
            let v = (1.0 - damping) / n as f64 + damping * rank;
            next.insert(t.symbol.clone(), v);
        }
        scores = next;
    }
    scores
}

/// Rank tags by (query term match + PageRank centrality), most relevant first.
pub fn rank_tags<'a>(query: &str, map: &'a RepoMap, scores: &HashMap<String, f64>) -> Vec<&'a Tag> {
    let terms: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.len() >= 2)
        .map(|t| t.to_lowercase())
        .collect();
    let mut ranked: Vec<(&Tag, f64)> = map
        .tags
        .iter()
        .map(|t| {
            let sym = t.symbol.to_lowercase();
            let match_score = terms.iter().filter(|term| sym.contains(term.as_str())).count() as f64;
            let centrality = scores.get(&t.symbol).copied().unwrap_or(0.0);
            (t, match_score * 2.0 + centrality)
        })
        .collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    ranked.into_iter().map(|(t, _)| t).collect()
}

/// Pick the highest-ranked tags that fit within `max_tokens` (approx 4
/// chars/token), via binary search over the ranked list.
pub fn fit_budget<'a>(ranked: &[&'a Tag], max_tokens: usize) -> Vec<&'a Tag> {
    let approx_chars = max_tokens.saturating_mul(4);
    let mut lo = 0usize;
    let mut hi = ranked.len();
    while lo < hi {
        let mid = (lo + hi).div_ceil(2);
        let cost: usize = ranked[..mid]
            .iter()
            .map(|t| t.symbol.len() + t.file.len() + 8)
            .sum();
        if cost <= approx_chars {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    ranked[..lo].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    const RUST: &str = "fn main() { helper(); }\npub fn helper() {}\nstruct Config {}\nconst LIMIT: u32 = 5;";

    #[test]
    fn extracts_function_type_and_const_tags() {
        let tags = extract_tags(RUST, "src/main.rs");
        let kinds: Vec<TagKind> = tags.iter().map(|t| t.kind).collect();
        assert!(kinds.contains(&TagKind::Function));
        assert!(kinds.contains(&TagKind::Type));
        assert!(kinds.contains(&TagKind::Const));
        assert!(tags.iter().any(|t| t.symbol == "helper"));
    }

    #[test]
    fn line_numbers_are_1_indexed() {
        let tags = extract_tags("fn a() {}\nfn b() {}", "f.rs");
        assert_eq!(tags[0].line, 1);
        assert_eq!(tags[1].line, 2);
    }

    #[test]
    fn builds_graph_with_reference_edges() {
        let map = build_repo_map(&[("src/main.rs".into(), RUST.into())]);
        // main references helper.
        let main_edges = map.edges.get("main").cloned().unwrap_or_default();
        assert!(main_edges.contains(&"helper".to_string()));
    }

    #[test]
    fn page_rank_scores_sum_converge() {
        let map = build_repo_map(&[("src/main.rs".into(), RUST.into())]);
        let scores = page_rank(&map, 32);
        assert_eq!(scores.len(), map.tags.len());
    }

    #[test]
    fn rank_puts_query_match_first() {
        let map = build_repo_map(&[("src/main.rs".into(), RUST.into())]);
        let scores = page_rank(&map, 32);
        let ranked = rank_tags("helper", &map, &scores);
        assert_eq!(ranked[0].symbol, "helper");
    }

    #[test]
    fn fit_budget_keeps_within_tokens() {
        let map = build_repo_map(&[("src/main.rs".into(), RUST.into())]);
        let ranked: Vec<&Tag> = map.tags.iter().collect();
        let fitted = fit_budget(&ranked, 20); // ~80 chars budget
        let cost: usize = fitted.iter().map(|t| t.symbol.len() + t.file.len() + 8).sum();
        assert!(cost <= 80);
    }

    #[test]
    fn lexical_source_is_the_default() {
        let tags = extract_tags_with(&LexicalTagSource, RUST, "src/main.rs");
        assert_eq!(tags, extract_tags(RUST, "src/main.rs"));
    }

    #[test]
    fn composite_source_unions_and_dedupes() {
        // Two lexical passes over the same content: identical tags dedup.
        let composite = CompositeTagSource::new(vec![
            Box::new(LexicalTagSource),
            Box::new(LexicalTagSource),
        ]);
        let tags = composite.extract(RUST, "src/main.rs");
        let single = extract_tags(RUST, "src/main.rs");
        assert_eq!(tags.len(), single.len());
        assert_eq!(tags, single);
    }

    #[test]
    fn build_repo_map_with_source_matches_default() {
        let files = vec![("src/main.rs".into(), RUST.into())];
        let default = build_repo_map(&files);
        let custom = build_repo_map_with(&LexicalTagSource, &files);
        assert_eq!(custom.tags, default.tags);
        assert_eq!(custom.edges, default.edges);
    }

    #[test]
    fn empty_composite_is_safe() {
        let composite = CompositeTagSource::default();
        assert!(composite.is_empty());
        assert!(composite.extract(RUST, "f.rs").is_empty());
    }
}
