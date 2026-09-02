//! P45.1–P45.3 — SQLite pragma tuning for the **non-crypto** DBs.
//!
//! The SQLCipher **vault is intentionally untouched**: credentials must not
//! trade durability, so `synchronous=FULL` (its current setting) stays.
//! These helpers are only ever called from the memory/search/replay indexes.
//!
//! - P45.1 `synchronous=NORMAL` — safe with WAL, major write throughput win.
//! - P45.2 `mmap_size=256MB` — zero-copy reads on the read-mostly FTS5 /
//!   trigram / search indexes (opt-in via `read_heavy`).
//! - P45.3 `journal_size_limit` + throttled `wal_autocheckpoint` — bound WAL
//!   growth and avoid per-commit stalls (checkpoint less often, never
//!   unbounded).

use rusqlite::Connection;

/// P45.1 + P45.3 for any non-vault connection (journal WAL, synchronous
/// NORMAL, bounded WAL). In-memory connections accept the pragmas as no-ops.
pub fn apply_non_vault(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA journal_size_limit=67108864;
         PRAGMA wal_autocheckpoint=4000;",
    )
}

/// P45.2 — memory-map the read-heavy FTS5/trigram/search indexes (256 MiB).
/// Call after `apply_non_vault` on the read-mostly stores only.
pub fn apply_read_heavy(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA mmap_size=268435456;")
}

/// Single call for the common read-heavy case.
pub fn apply_read_heavy_index(conn: &Connection) -> rusqlite::Result<()> {
    apply_non_vault(conn)?;
    apply_read_heavy(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn pragma_i64(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    /// P45.1 acceptance: per-DB `synchronous` value asserted on a real
    /// on-disk connection (in-memory connections ignore some journal pragmas).
    #[test]
    fn non_vault_db_gets_wal_and_synchronous_normal() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-pragmas-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("idx.sqlite");
        let conn = Connection::open(&path).unwrap();
        apply_non_vault(&conn).unwrap();

        // synchronous=NORMAL (1), WAL journal, bounded WAL + throttled checkpoint.
        assert_eq!(
            pragma_i64(&conn, "PRAGMA synchronous;"),
            1,
            "synchronous must be NORMAL (1)"
        );
        let journal: String = conn
            .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(journal, "wal", "journal_mode must be WAL");
        assert_eq!(pragma_i64(&conn, "PRAGMA journal_size_limit;"), 67_108_864);
        assert_eq!(pragma_i64(&conn, "PRAGMA wal_autocheckpoint;"), 4000);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// P45.2 acceptance: mmap_size applied only via the read-heavy helper.
    #[test]
    fn read_heavy_index_gets_mmap_without_mutation_side_effects() {
        let dir = std::env::temp_dir().join(format!("everyaios-mmap-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("fts.sqlite");
        let conn = Connection::open(&path).unwrap();
        apply_read_heavy_index(&conn).unwrap();
        assert_eq!(
            pragma_i64(&conn, "PRAGMA mmap_size;"),
            268_435_456,
            "mmap_size must be 256MiB"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    /// P45.1 acceptance: the plain non-vault call must NOT set mmap (it is
    /// reserved for the read-heavy helper) — keeps write DBs off mmap.
    #[test]
    fn plain_pragma_call_leaves_mmap_default() {
        let dir = std::env::temp_dir().join(format!(
            "everyaios-mmap-default-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("plain.sqlite");
        let conn = Connection::open(&path).unwrap();
        apply_non_vault(&conn).unwrap();
        let mmap = pragma_i64(&conn, "PRAGMA mmap_size;");
        assert!(
            mmap != 268_435_456,
            "mmap must not be applied by the plain call"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
