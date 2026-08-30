//! Registration-sync safety net (Fix 1a).
//!
//! Tauri has no runtime way to ask "which `#[tauri::command]` fns are
//! registered?" — a command defined but never wired into an
//! `invoke_handler(generate_handler![...])` silently never exists to the UI.
//! With ~170 commands spread across 30 modules (and growing) this is a real
//! footgun: the entire 1x extraction of `lib.rs` (Fix 1) is only safe if no
//! command disappears in the shuffle.
//!
//! This test parses the crate's own source and asserts:
//!   1. Every `#[tauri::command] fn` is referenced (by its bare name) in at
//!      least one `generate_handler![ ... ]` list somewhere in `src/`.
//!   2. No `generate_handler!` term refers to something that is not a command
//!      fn (catches renamed/typo'd registrations).
//!
//! It is deliberately central-registration-agnostic: it holds whether commands
//! are listed in `lib.rs` (today) or in per-module `handler()` builders (the
//! target of Fix 1d), because it keys on the stable terminal identifier of
//! each command fn.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

fn src_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn walk_rs(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            walk_rs(&path, out);
        } else if path.extension().map(|e| e == "rs").unwrap_or(false) {
            out.push(path);
        }
    }
}

fn source_texts() -> Vec<(PathBuf, String)> {
    let mut files = Vec::new();
    walk_rs(&src_dir(), &mut files);
    files
        .into_iter()
        .map(|p| {
            let text =
                std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
            (p, text)
        })
        .collect()
}

/// All `#[tauri::command] fn <name>` definitions in a source text.
fn command_fn_names(text: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    let lines: Vec<&str> = text.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with("#[tauri::command") {
            // The `fn` may be on this line, or a few lines later when other
            // attributes or doc comments sit between `#[tauri::command]` and
            // the fn (e.g. `#[allow(clippy::too_many_arguments)]` on a wide IPC
            // command). Scan forward past attribute/comment lines.
            let mut window = trimmed.to_string();
            if !window.contains("fn ") {
                for next in lines.iter().skip(i + 1) {
                    let n = next.trim();
                    window.push(' ');
                    window.push_str(next);
                    // Attributes (and their doc comments) may chain; the fn
                    // follows once we hit a non-`#`/`//` line.
                    if !n.starts_with('#') && !n.starts_with("//") {
                        break;
                    }
                }
            }
            // fn name may be qualified later by pub/inline/jump markers — capture
            // the identifier immediately after `fn`.
            let Some(pos) = window.find("fn ") else {
                continue;
            };
            let rest = &window[pos + 3..];
            let name: String = rest
                .trim_start()
                .chars()
                .take_while(|c| c.is_ascii_alphabetic() || *c == '_')
                .collect();
            if !name.is_empty() {
                names.insert(name);
            }
        }
    }
    names
}

/// The set of terminal identifiers referenced inside every
/// `generate_handler![ ... ]` block in a source text.
fn registered_terminal_names(texts: &[(PathBuf, String)]) -> BTreeSet<String> {
    let mut registered = BTreeSet::new();
    for (_, text) in texts {
        let mut search = 0;
        while let Some(start) = text[search..].find("generate_handler!") {
            let start_abs = search + start;
            // Skip to the opening `[` (attribute/macro path may be like
            // `tauri::generate_handler![` — find the first `[` after the word).
            let Some(open_bracket_rel) = text[start_abs..].find('[') else {
                break;
            };
            let open_abs = start_abs + open_bracket_rel;
            // Match braces to find the closing `]`.
            let mut depth = 0usize;
            let mut close_abs = None;
            for (i, b) in text[open_abs..].bytes().enumerate() {
                match b {
                    b'[' => depth += 1,
                    b']' => {
                        depth -= 1;
                        if depth == 0 {
                            close_abs = Some(open_abs + i);
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let Some(close_abs) = close_abs else {
                panic!("unterminated generate_handler! [ ... ] in src");
            };
            let body = &text[open_abs + 1..close_abs];
            // Split on top-level commas (naive but lists are identifier-only).
            for term in body.split(',') {
                let term = term.trim();
                if term.is_empty() {
                    continue;
                }
                // Drop the module/prefix, keep the terminal identifier.
                let terminal = term.rsplit("::").next().unwrap_or(term).trim().to_string();
                if !terminal.is_empty()
                    && terminal
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_')
                {
                    registered.insert(terminal);
                }
            }
            search = close_abs + 1;
        }
    }
    registered
}

#[test]
fn every_command_is_registered() {
    let texts = source_texts();

    // Collect defined commands and the union of registered terminals.
    let mut defined: BTreeSet<String> = BTreeSet::new();
    for (path, text) in &texts {
        let names = command_fn_names(text);
        if !names.is_empty() {
            eprintln!("{}: {} command(s)", path.display(), names.len());
        }
        defined.extend(names);
    }
    let registered = registered_terminal_names(&texts);

    // 1. Every defined command must be registered somewhere.
    let unregistered: Vec<&String> = defined
        .iter()
        .filter(|name| !registered.contains(*name))
        .collect();
    assert!(
        unregistered.is_empty(),
        "commands defined but never wired into an invoke_handler: {unregistered:?}"
    );

    // 2. Registered terms should match a defined command (allow obvious
    //    exceptions for non-command helpers mistakenly caught — assert none
    //    by default so the list stays honest).
    let extra: Vec<&String> = registered
        .iter()
        .filter(|name| !defined.contains(*name))
        .collect();
    assert!(
        extra.is_empty(),
        "generate_handler! references a name with no #[tauri::command] fn: {extra:?}"
    );

    eprintln!(
        "registration_sync: {} commands defined, {} registered, all wired.",
        defined.len(),
        registered.len()
    );
}

#[test]
fn every_handler_refers_to_a_real_module() {
    // Guard-specific to Fix 1d: if we move registration into per-family
    // `handler()` builders, those builders still expand to real generate_handler
    // lists, so this test remains a no-op path. Here we just ensure the crate
    // has at least one generate_handler! so the other test scans something.
    let texts = source_texts();
    let any = texts.iter().any(|(_, t)| t.contains("generate_handler!"));
    assert!(
        any,
        "no generate_handler! — nothing would ever be registered"
    );
}
