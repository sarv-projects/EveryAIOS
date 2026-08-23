//! P11.5.9 — code-intel Tauri commands: repo-map (I7 RepoMap library wired to
//! the UI), DeepWiki-style file outline, MODEL_ALIASES resolution from
//! `everyaios.toml`, and the `// ai!` marker scan (I10 watcher feed).

use std::collections::BTreeMap;
use std::path::Path;

use everyaios_codeintel::repomap::{build_repo_map, page_rank, TagKind};
use serde::Serialize;
use tauri::State;

use crate::AppState;

/// One ranked repo-map row (UI-displayable).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoMapRow {
    pub symbol: String,
    pub kind: String,
    pub file: String,
    pub line: u32,
    pub rank: f64,
}

/// P11.5.9 — build a repo map for a directory: tags + PageRank over the
/// symbol graph + budget-fit ordering. Deterministic (sorted edges, stable
/// order). The SQLite cache is the coordinator-side follow-on; this command
/// is the live path.
#[tauri::command]
pub fn repomap_build(
    _state: State<'_, AppState>,
    dir: String,
    max_files: Option<usize>,
) -> Result<Vec<RepoMapRow>, String> {
    let max_files = max_files.unwrap_or(200).min(2000);
    let files = read_source_files(Path::new(&dir), max_files)?;
    let map = build_repo_map(&files);
    let ranks = page_rank(&map, 32);

    let mut rows: Vec<RepoMapRow> = map
        .tags
        .iter()
        .map(|t| RepoMapRow {
            symbol: t.symbol.clone(),
            kind: match t.kind {
                TagKind::Function => "fn",
                TagKind::Type => "type",
                TagKind::Const => "const",
                TagKind::Module => "mod",
            }
            .into(),
            file: t.file.clone(),
            line: t.line,
            rank: ranks.get(&t.symbol).copied().unwrap_or(0.0),
        })
        .collect();
    rows.sort_by(|a, b| {
        b.rank
            .partial_cmp(&a.rank)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.symbol.cmp(&b.symbol))
    });
    Ok(rows)
}

/// One outline entry (DeepWiki `file_outline` pattern — open Rust reference).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineEntry {
    pub symbol: String,
    pub kind: String,
    pub line: u32,
}

/// P11.5.9 — `file_outline`: symbols in document order for one source file.
/// Tree-sitter plugs in as a TagSource later; the lexical extractor is the
/// deterministic default (same as RepoMap).
#[tauri::command]
pub fn file_outline(
    _state: State<'_, AppState>,
    path: String,
) -> Result<Vec<OutlineEntry>, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file = Path::new(&path)
        .file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let tags = everyaios_codeintel::repomap::extract_tags(&content, &file);
    let mut entries: Vec<OutlineEntry> = tags
        .into_iter()
        .map(|t| OutlineEntry {
            symbol: t.symbol,
            kind: match t.kind {
                TagKind::Function => "fn",
                TagKind::Type => "type",
                TagKind::Const => "const",
                TagKind::Module => "mod",
            }
            .into(),
            line: t.line,
        })
        .collect();
    entries.sort_by_key(|e| e.line);
    Ok(entries)
}

/// P11.5.9 — resolve a MODEL_ALIASES short name from `everyaios.toml`.
#[tauri::command]
pub fn model_aliases_resolve(
    _state: State<'_, AppState>,
    reference: String,
) -> Result<serde_json::Value, String> {
    let cfg = everyaios_core::config::Config::load().map_err(|e| e.to_string())?;
    let (provider, model) = cfg.resolve_model_alias(&reference, "openai");
    Ok(serde_json::json!({
        "alias": reference,
        "provider": provider,
        "model": model,
        "usedAlias": cfg.model_aliases.contains_key(&reference),
        "aliases": cfg.model_aliases,
    }))
}

/// P11.5.9 — scan a file (or directory, first file) for `// ai!` markers and
/// return the auto-submit payloads (I10 watcher feed — the notify-crate glue
/// is the storage→core bridge; this is the deterministic scan half).
#[tauri::command]
pub fn ai_markers_scan(
    _state: State<'_, AppState>,
    path: String,
) -> Result<Vec<everyaios_core::ai_marker::AutoSubmitPayload>, String> {
    let p = Path::new(&path);
    let files: Vec<String> = if p.is_dir() {
        read_source_files(p, 50)?
            .into_iter()
            .map(|(f, _)| f)
            .collect()
    } else {
        vec![path.clone()]
    };
    let mut out = Vec::new();
    for f in files {
        let Ok(content) = std::fs::read_to_string(&f) else {
            continue;
        };
        let lines: Vec<&str> = content.lines().collect();
        for m in everyaios_core::ai_marker::scan_markers(&lines, 5, 10) {
            out.push(everyaios_core::ai_marker::AutoSubmitPayload {
                file: f.clone(),
                marker: m,
            });
        }
    }
    Ok(out)
}

/// Walk a directory for source files (bounded, deterministic order).
fn read_source_files(dir: &Path, max_files: usize) -> Result<Vec<(String, String)>, String> {
    const EXTS: [&str; 14] = [
        "rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h", "hpp", "md", "toml",
    ];
    let mut files: Vec<String> = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else {
            continue;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if !p.ends_with("node_modules")
                    && !p.ends_with("target")
                    && !p.ends_with(".git")
                    && !p.ends_with("dist")
                {
                    stack.push(p);
                }
            } else if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                if EXTS.contains(&ext) {
                    files.push(p.to_string_lossy().into_owned());
                }
            }
            if files.len() >= max_files {
                break;
            }
        }
        if files.len() >= max_files {
            break;
        }
    }
    files.sort();
    let mut out = Vec::with_capacity(files.len());
    for f in files {
        if let Ok(content) = std::fs::read_to_string(&f) {
            out.push((f.clone(), content));
        }
    }
    Ok(out)
}

/// Helper used by tests/build scripts to count extensions per dir (kept small
/// and unused-public to avoid dead-code warnings in the command surface).
#[allow(dead_code)]
fn _ext_counts(dir: &Path) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                *counts.entry(ext.to_string()).or_insert(0) += 1;
            }
        }
    }
    counts
}
