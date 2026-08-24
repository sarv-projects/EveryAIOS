//! P36 (G7) — FTS5 trigram index in SQLite for **substring** filename search.
//!
//! The existing FTS5 default tokenizer is prefix-friendly but weak at
//! mid-string matches ("report-2024" won't hit a query for "2024"). The
//! `trigram` tokenizer makes every 3-char subsequence indexable → substring
//! queries that scale (the USN journal piece of G7 is the companion
//! incremental scan; see `usn.rs`).

use rusqlite::{params, Connection, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct TrigramHit {
    pub path: PathBuf,
    pub score: f64,
}

/// Trigram FTS index over filenames (basenames only — the substring surface).
#[derive(Debug)]
pub struct TrigramIndex {
    conn: Connection,
}

impl TrigramIndex {
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(
            "CREATE VIRTUAL TABLE filenames USING fts5(name, tokenize = 'trigram');",
        )?;
        Ok(Self { conn })
    }

    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS filenames USING fts5(name, tokenize = 'trigram');",
        )?;
        Ok(Self { conn })
    }

    pub fn insert(&mut self, path: &Path) -> Result<()> {
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name.len() >= 3 {
            self.conn.execute("INSERT OR REPLACE INTO filenames(name) VALUES (?1)", params![name])?;
        }
        Ok(())
    }

    pub fn insert_batch(&mut self, paths: &[&Path]) -> Result<()> {
        for p in paths {
            self.insert(p)?;
        }
        Ok(())
    }

    pub fn search(&self, needle: &str, limit: usize) -> Result<Vec<TrigramHit>> {
        let needle = needle.trim();
        if needle.len() < 3 {
            // Substring under 3 chars: fall back to a LIKE scan of the table
            // (FTS5 trigram needs >= 3 chars) — still bounded + honest.
            return self.like_search(needle, limit);
        }
        let mut stmt = self
            .conn
            .prepare("SELECT name, bm25(filenames) AS b FROM filenames WHERE filenames MATCH ?1 ORDER BY b LIMIT ?2")?;
        // The trigram tokenizer accepts the literal substring quoted.
        let q = format!("\"{needle}\"");
        let rows = stmt.query_map(params![q, limit as i64], |r| Ok(TrigramHit { path: PathBuf::from(r.get::<_, String>(0)?), score: r.get(1)? }))?;
        rows.collect()
    }

    fn like_search(&self, needle: &str, limit: usize) -> Result<Vec<TrigramHit>> {
        let mut stmt = self
            .conn
            .prepare("SELECT name FROM filenames WHERE name LIKE ?1 LIMIT ?2")?;
        let pat = format!("%{}%", needle.replace('%', "\\%"));
        let rows = stmt.query_map(params![pat, limit as i64], |r| {
            Ok(TrigramHit { path: PathBuf::from(r.get::<_, String>(0)?), score: 1.0 })
        })?;
        rows.collect()
    }

    pub fn len(&self) -> usize {
        self.conn
            .query_row("SELECT COUNT(*) FROM filenames", [], |r| r.get(0))
            .unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp() -> std::path::PathBuf {
        let n = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("everyaios-trigram-{}-{n}", std::process::id()))
    }

    #[test]
    fn substring_search_hits_mid_string() {
        let mut idx = TrigramIndex::open_in_memory().unwrap();
        idx.insert(Path::new("/tmp/2024-report-final.pdf")).unwrap();
        idx.insert(Path::new("/tmp/notes.txt")).unwrap();
        idx.insert(Path::new("/tmp/budget.xlsx")).unwrap();
        let hits = idx.search("report", 10).unwrap();
        assert!(hits.iter().any(|h| h.path.ends_with("2024-report-final.pdf")));
        let hits = idx.search("2024", 10).unwrap();
        assert!(hits.iter().any(|h| h.path.ends_with("2024-report-final.pdf")), "mid-string 2024 must match");
        let _ = fs::remove_dir_all(tmp());
    }

    #[test]
    fn short_query_falls_back_to_like() {
        let mut idx = TrigramIndex::open_in_memory().unwrap();
        idx.insert(Path::new("/tmp/a12.txt")).unwrap();
        let hits = idx.search("a1", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].path.ends_with("a12.txt"));
    }

    #[test]
    fn no_match_returns_empty() {
        let mut idx = TrigramIndex::open_in_memory().unwrap();
        idx.insert(Path::new("/tmp/only.txt")).unwrap();
        assert!(idx.search("zzz", 10).unwrap().is_empty());
    }
}