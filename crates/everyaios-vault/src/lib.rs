//! everyaios-vault — SQLCipher-encrypted key-ring store (ARCH/03, J8).
//!
//! All secrets (API keys, OAuth tokens, session cookies) live in a
//! SQLCipher database. The Rust core holds the encryption key; the TS
//! sidecar only ever sees `key_id` handles (CES sealed channel, doc 19).
//!
//! P0.1 scope: open/create an encrypted DB with `PRAGMA key`, versioned
//! schema, and a smoke-tested round trip. P1.1 adds the key-pool schema,
//! CRUD, routing/cooldown state, and per-key budgets.

use std::path::Path;

use rusqlite::{Connection, OptionalExtension};

const SCHEMA_VERSION: i64 = 1;

const INIT_SQL: &str = r#"
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- P0.1 placeholder table; the real key-pool schema lands in P1.1.
CREATE TABLE IF NOT EXISTS key_pool (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    provider   TEXT NOT NULL,
    key_id     TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);
"#;

/// An open SQLCipher vault handle. Not `Clone` — ownership is the point.
pub struct Vault {
    conn: Connection,
}

impl Vault {
    /// Open (or create) an encrypted database at `path`.
    ///
    /// `key` is the raw encryption key. **P0.1 placeholder**: production
    /// key management (KDF from passphrase/keyfile) is designed in P1.1.
    pub fn open(path: &Path, key: &str) -> Result<Self, VaultError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(VaultError::Io)?;
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "key", key)?;
        conn.pragma_update(None, "cipher_page_size", 4096)?;
        conn.execute_batch(INIT_SQL)?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('schema_version', ?1)",
            [SCHEMA_VERSION.to_string()],
        )?;
        Ok(Self { conn })
    }

    /// Open an in-memory encrypted vault (tests only).
    #[cfg(test)]
    pub fn open_in_memory(key: &str) -> Result<Self, VaultError> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "key", key)?;
        conn.execute_batch(INIT_SQL)?;
        Ok(Self { conn })
    }

    /// Read-only check: is the DB intact and encrypted-keyed?
    pub fn status(&self) -> String {
        let version: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten();
        match version {
            Some(v) => format!("sqlcipher schema v{v}"),
            None => "sqlcipher (uninitialized)".into(),
        }
    }

    /// Register a key handle. `key_id` is the opaque reference the sidecar
    /// sees; the raw secret is stored by P1.1's pool schema.
    pub fn register_key(&self, provider: &str, key_id: &str) -> Result<(), VaultError> {
        self.conn.execute(
            "INSERT INTO key_pool (provider, key_id, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![provider, key_id, now_ms()],
        )?;
        Ok(())
    }

    /// List key_ids for a provider.
    pub fn list_keys(&self, provider: &str) -> Result<Vec<String>, VaultError> {
        let mut stmt = self
            .conn
            .prepare("SELECT key_id FROM key_pool WHERE provider = ?1 ORDER BY id")?;
        let rows = stmt.query_map([provider], |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Verify the encryption key actually decrypts the DB (SQLCipher
    /// returns an error on a wrong key at the first read).
    pub fn verify_key(&self) -> Result<bool, VaultError> {
        let n: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM key_pool", [], |r| r.get(0))?;
        Ok(n >= 0)
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_create_and_roundtrip() {
        let dir = std::env::temp_dir().join(format!("everyaios-vault-test-{}", std::process::id()));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);

        {
            let vault = Vault::open(&path, "test-key").expect("open");
            assert!(vault.status().contains("schema v1"));
            vault.register_key("anthropic", "key-1").unwrap();
            vault.register_key("anthropic", "key-2").unwrap();
            vault.register_key("openai", "key-3").unwrap();
            assert!(vault.verify_key().unwrap());
        }

        // Reopen with the SAME key: data persists and decrypts.
        {
            let vault = Vault::open(&path, "test-key").expect("reopen with same key");
            let anthropic = vault.list_keys("anthropic").unwrap();
            assert_eq!(anthropic, vec!["key-1".to_string(), "key-2".to_string()]);
            assert_eq!(
                vault.list_keys("openai").unwrap(),
                vec!["key-3".to_string()]
            );
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn in_memory_roundtrip() {
        let vault = Vault::open_in_memory("mem-key").expect("open");
        vault.register_key("deepseek", "dsk-1").unwrap();
        assert_eq!(
            vault.list_keys("deepseek").unwrap(),
            vec!["dsk-1".to_string()]
        );
    }

    #[test]
    fn wrong_key_fails_verify() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-vault-wrong-{}", std::process::id()));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);

        Vault::open(&path, "right-key").expect("create with right key");
        // Opening with a wrong key must fail (SQLCipher key mismatch).
        assert!(Vault::open(&path, "wrong-key").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
