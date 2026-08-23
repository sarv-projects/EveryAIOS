//! P11.5.3 — source-control commands for the IDE SCM panel. Runs the real
//! `git` binary via `std::process` (`git -C <dir>`); returns parsed
//! porcelain status, recent log, and current branch. Fails honestly with
//! "not a git repository" when the directory isn't in a repo — the panel
//! shows the empty state instead of inventing data.

use std::process::Command;

fn run_git(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .map_err(|e| format!("git: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.contains("not a git repository") {
            "not a git repository".to_string()
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Parsed `git status --porcelain=v1 -b` row.
#[derive(serde::Serialize)]
struct StatusRow {
    code: String, // e.g. " M", "??", "A "
    path: String,
}

/// Branch + status rows for the SCM panel.
#[tauri::command]
pub fn git_status(dir: String) -> Result<serde_json::Value, String> {
    let raw = run_git(&dir, &["status", "--porcelain=v1", "-b"])?;
    let mut branch = "(detached)".to_string();
    let mut rows: Vec<StatusRow> = Vec::new();
    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            branch = rest.split("...").next().unwrap_or(rest).to_string();
            continue;
        }
        if line.len() >= 4 {
            rows.push(StatusRow {
                code: line[..2].to_string(),
                path: line[3..].to_string(),
            });
        }
    }
    Ok(serde_json::json!({ "branch": branch, "rows": rows, "count": rows.len() }))
}

/// Recent commit log (`--oneline -N`) for the SCM history view.
#[tauri::command]
pub fn git_log(dir: String, n: Option<usize>) -> Result<serde_json::Value, String> {
    let n = n.unwrap_or(12).to_string();
    let raw = run_git(&dir, &["log", "--oneline", "-n", &n])?;
    let commits: Vec<serde_json::Value> = raw
        .lines()
        .filter_map(|l| {
            let (hash, rest) = l.split_once(' ')?;
            Some(serde_json::json!({ "hash": hash, "message": rest }))
        })
        .collect();
    Ok(serde_json::json!({ "commits": commits }))
}

/// Unified diff of unstaged changes (`git diff`) for the diff/SCM view.
#[tauri::command]
pub fn git_diff(dir: String, path: Option<String>) -> Result<serde_json::Value, String> {
    if let Some(p) = &path {
        let raw = run_git(&dir, &["diff", "--", p])?;
        return Ok(serde_json::json!({ "diff": raw }));
    }
    let raw = run_git(&dir, &["diff"])?;
    Ok(serde_json::json!({ "diff": raw }))
}

/// Stage all changes (`git add -A`) — SCM panel "Stage all".
#[tauri::command]
pub fn git_stage_all(dir: String) -> Result<serde_json::Value, String> {
    run_git(&dir, &["add", "-A"])?;
    Ok(serde_json::json!({ "staged": true }))
}

/// Commit staged changes with a message.
#[tauri::command]
pub fn git_commit(dir: String, message: String) -> Result<serde_json::Value, String> {
    run_git(&dir, &["commit", "-m", &message])?;
    Ok(serde_json::json!({ "committed": true }))
}

/// Find the nearest enclosing git root for a file/dir path (for the SCM
/// panel when a file is open in the editor). Returns `None` honestly.
#[tauri::command]
pub fn git_root(start: String) -> Result<serde_json::Value, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(&start)
        .arg("rev-parse")
        .arg("--show-toplevel")
        .output()
        .map_err(|e| format!("git: {e}"))?;
    if !out.status.success() {
        return Ok(serde_json::json!({ "root": null }));
    }
    let root = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(serde_json::json!({ "root": if root.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(root) } }))
}
