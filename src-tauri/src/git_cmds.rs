//! P11.5.3 — source-control commands for the IDE SCM panel. Runs the real
//! `git` binary via `std::process` (`git -C <dir>`); returns parsed
//! porcelain status, recent log, and current branch. Fails honestly with
//! "not a git repository" when the directory isn't in a repo — the panel
//! shows the empty state instead of inventing data.

use std::process::Command;
use tauri::State;

use crate::AppState;

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
/// v3.59: human-UI path — the click is the authorization, the action is
/// audited on the same Merkle chain as agent/ticket effects (spec §4.3 / P47.1).
#[tauri::command]
pub fn git_stage_all(
    state: State<'_, AppState>,
    dir: String,
) -> Result<serde_json::Value, String> {
    run_git(&dir, &["add", "-A"])?;
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "git.stage",
        serde_json::json!({ "dir": dir, "scope": "all" }),
    );
    Ok(serde_json::json!({ "staged": true }))
}

/// Commit staged changes with a message.
/// v3.59: human-UI path — audited (see `git_stage_all`).
#[tauri::command]
pub fn git_commit(
    state: State<'_, AppState>,
    dir: String,
    message: String,
) -> Result<serde_json::Value, String> {
    run_git(&dir, &["commit", "-m", &message])?;
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "git.commit",
        serde_json::json!({ "dir": dir, "message": message }),
    );
    Ok(serde_json::json!({ "committed": true }))
}/// Find the nearest enclosing git root for a file/dir path (for the SCM
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

/// P41.2 — worktree path convention: `<repo>/.worktrees/<name>`.
fn worktree_path(repo: &str, name: &str) -> String {
    format!("{}/.worktrees/{}", repo.trim_end_matches('/'), name)
}

/// P41.2 — Worktree-first parallelism (I12): create a `git worktree` for one
/// B3 sub-agent, derived from `base` (a branch or commit). The sub-agent
/// works in its own checkout so N agents never share a dirty working tree
/// (Codex-app pattern). The worktree branch is named `<name>`.
#[tauri::command]
pub fn git_worktree_add(repo: String, name: String, base: String) -> Result<serde_json::Value, String> {
    let path = worktree_path(&repo, &name);
    // `git worktree add -b <name> <path> <base>` — a fresh branch off base.
    run_git(&repo, &["worktree", "add", "-b", &name, &path, &base])?;
    Ok(serde_json::json!({
        "path": path,
        "branch": name,
        "base": base,
    }))
}

/// P41.2 — list the repo's worktrees (porcelain: `worktree <path>` + `branch`
/// lines) for the plan's per-worktree review surface.
#[tauri::command]
pub fn git_worktree_list(repo: String) -> Result<serde_json::Value, String> {
    let raw = run_git(&repo, &["worktree", "list", "--porcelain"])?;
    let mut trees: Vec<serde_json::Value> = Vec::new();
    let mut current: Option<(String, Option<String>)> = None;
    for line in raw.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(c) = current.take() {
                trees.push(serde_json::json!({ "path": c.0, "branch": c.1 }));
            }
            current = Some((path.to_string(), None));
        } else if let Some(branch) = line.strip_prefix("branch ") {
            if let Some((_, slot)) = current.as_mut() {
                *slot = Some(branch.trim_start_matches("refs/heads/").to_string());
            }
        }
    }
    if let Some(c) = current.take() {
        trees.push(serde_json::json!({ "path": c.0, "branch": c.1 }));
    }
    Ok(serde_json::json!({ "worktrees": trees }))
}

/// P41.2 — commit a worktree's changes onto its own branch, then merge it
/// into the main branch through the plan (review merges per-worktree).
/// Returns the merge commit hash.
#[tauri::command]
pub fn git_worktree_merge(
    state: State<'_, AppState>,
    repo: String,
    name: String,
    target_branch: String,
    message: String,
) -> Result<serde_json::Value, String> {
    let path = worktree_path(&repo, &name);
    // Commit the worktree's work onto its branch (if anything changed).
    run_git(&path, &["add", "-A"])?;
    let status = Command::new("git")
        .arg("-C")
        .arg(&path)
        .args(["diff", "--cached", "--quiet"])
        .status()
        .map_err(|e| format!("git: {e}"))?;
    if !status.success() {
        run_git(&path, &["commit", "-m", &message])?;
    }
    // Merge the worktree branch into the main branch (from the main worktree).
    run_git(&repo, &["checkout", &target_branch])?;
    run_git(&repo, &["merge", "--no-ff", &name, "-m", &message])?;
    let head = run_git(&repo, &["rev-parse", "HEAD"])?;
    // v3.59 — human-UI path audit (spec §4.3 / P47.1).
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "git.worktree_merge",
        serde_json::json!({ "repo": repo, "branch": name, "into": target_branch }),
    );
    Ok(serde_json::json!({
        "merged": true,
        "branch": name,
        "into": target_branch,
        "mergeHead": head.trim(),
    }))
}

/// P41.2 — K2 reverse: revert the I8 commit and drop the worktree. `commit`
/// is the merge commit to revert (from `git_worktree_merge`); the worktree
/// and its branch are removed afterwards.
#[tauri::command]
pub fn git_worktree_revert(
    state: State<'_, AppState>,
    repo: String,
    name: String,
    commit: String,
) -> Result<serde_json::Value, String> {
    let path = worktree_path(&repo, &name);
    run_git(&repo, &["revert", "--no-edit", &commit])?;
    run_git(&repo, &["worktree", "remove", "--force", &path])?;
    run_git(&repo, &["branch", "-D", &name])?;
    // v3.59 — human-UI path audit (spec §4.3 / P47.1).
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "git.worktree_revert",
        serde_json::json!({ "repo": repo, "branch": name, "commit": commit }),
    );
    Ok(serde_json::json!({
        "reverted": true,
        "commit": commit,
        "worktreeDropped": true,
    }))
}
