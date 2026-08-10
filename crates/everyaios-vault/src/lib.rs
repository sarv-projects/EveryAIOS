//! everyaios-vault — SQLCipher-encrypted key-ring store (ARCH/03, J8).
//!
//! All secrets (API keys, OAuth tokens, session cookies) live in a
//! SQLCipher database. The Rust core holds the encryption key; the TS
//! sidecar only ever sees `key_id` / opaque handles (CES sealed channel,
//! doc 19 / doc 53 §2).
//!
//! P0.1 scope: open/create an encrypted DB with `PRAGMA key`, versioned
//! schema, and a smoke-tested round trip. P1.1 adds the key-pool schema
//! ([`keyring`]), CRUD, routing/cooldown state, per-key budgets, and the
//! credential broker ([`broker`]) that executes provider HTTP calls.

pub mod broker;
pub mod keyring;
pub mod ledger;
pub mod local;
pub mod oauth;
pub mod session_budget;

pub use broker::{usage_tokens, Broker, BrokerError, ChatStreamEvent};
pub use keyring::{
    KeyEntry, KeyInfo, KeyRing, KeyRingError, KeySpec, KeyStatus, RoutingPolicy, SelectedKey,
    COOLDOWN_BASE_SECS, COOLDOWN_CAP_SECS, MAX_429_SWITCHES,
};
pub use ledger::{default_pricing, Pricing, Usage, UsageRow};
pub use local::{Grammar, LocalEndpoint, LocalRuntime, DEFAULT_NUM_CTX, MIN_WARN_NUM_CTX};
pub use oauth::{DeviceCodeStart, DevicePoll, OAuthAccountInfo, OAuthError, OAuthManager, PkceStart};
pub use session_budget::{SessionBudget, DEFAULT_SESSION_BUDGET_USD};

use std::path::Path;

use rusqlite::{Connection, OptionalExtension};

const SCHEMA_VERSION: i64 = 4;

const INIT_SQL: &str = r#"
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- P0.1 placeholder table; kept for backward compatibility.
CREATE TABLE IF NOT EXISTS key_pool (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    provider   TEXT NOT NULL,
    key_id     TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

-- P1.1: the real key-ring schema (A2/A3, J8). Every row is one key in a
-- provider's pool: status tier, routing metadata, cooldown/budget/health
-- counters, and the raw secret (SQLCipher-encrypted at rest). The sidecar
-- only ever sees `opaque_handle`.
CREATE TABLE IF NOT EXISTS key_ring (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    provider        TEXT NOT NULL,
    key_id          TEXT NOT NULL,
    opaque_handle   TEXT NOT NULL UNIQUE,
    value           BLOB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'primary',
    model_filter    TEXT NOT NULL DEFAULT '',
    priority        INTEGER NOT NULL DEFAULT 100,
    tokens_day      INTEGER NOT NULL DEFAULT 0,
    cost_day        REAL NOT NULL DEFAULT 0,
    daily_token_cap INTEGER,
    daily_cost_cap  REAL,
    fail_count      INTEGER NOT NULL DEFAULT 0,
    success_count   INTEGER NOT NULL DEFAULT 0,
    last_used_at    INTEGER NOT NULL DEFAULT 0,
    cooldown_until  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(provider, key_id)
);
CREATE INDEX IF NOT EXISTS idx_key_ring_provider ON key_ring(provider);

-- P1.3 (A9, ARCH/05 §5.6): the ONE append-only cost ledger. Every completed
-- call records provider/model/key/session + cache-aware token counts + $ cost.
-- Shared by per-key budgets (ARCH/03), session efficiency projections, and
-- the UI's live token/cost stream. `tool` is nullable (set for tool calls).
CREATE TABLE IF NOT EXISTS token_usage (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    session      TEXT NOT NULL,
    provider     TEXT NOT NULL,
    model        TEXT NOT NULL,
    key_id       TEXT NOT NULL,
    in_tokens    INTEGER NOT NULL,
    out_tokens   INTEGER NOT NULL,
    cache_read   INTEGER NOT NULL,
    cache_write  INTEGER NOT NULL,
    cost         REAL NOT NULL,
    tool         TEXT
);
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session);
CREATE INDEX IF NOT EXISTS idx_token_usage_ts ON token_usage(ts);

-- P1.7 (A4, doc 33 §7.4): OAuth subscription tokens — encrypted at rest in
-- the SQLCipher vault, never visible to the sidecar. PK is (provider,
-- account_id); access_token is what the broker injects (also upserted into
-- key_ring for identical BYOK failover semantics), refresh_token + expiry
-- live here for the token lifecycle.
CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider      TEXT NOT NULL,
    account_id    TEXT NOT NULL,
    access_token  BLOB NOT NULL,
    refresh_token BLOB,
    token_type    TEXT NOT NULL DEFAULT 'Bearer',
    scopes        TEXT NOT NULL DEFAULT '',
    email         TEXT,
    expires_at    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (provider, account_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider);

-- P1.7 (A4): in-flight PKCE / device-code flows. `code_verifier` is kept in
-- the vault (never in the sidecar); device flows keep the device_code +
-- user_code until the user approves in their browser.
CREATE TABLE IF NOT EXISTS oauth_pending (
    provider          TEXT NOT NULL PRIMARY KEY,
    state             TEXT,
    code_verifier     TEXT NOT NULL,
    device_code       TEXT,
    user_code         TEXT,
    verification_uri  TEXT,
    interval_secs     INTEGER NOT NULL DEFAULT 5,
    created_at        INTEGER NOT NULL
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
            "INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [SCHEMA_VERSION.to_string()],
        )?;
        Ok(Self { conn })
    }

    /// Open an in-memory encrypted vault. Tests use this; the desktop shell
    /// falls back to it when the on-disk vault cannot be opened at boot so
    /// the app stays responsive (nothing persists).
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

    /// Shared (crate-internal) connection accessor — the [`KeyRing`]
    /// selection engine runs on the same encrypted connection.
    pub(crate) fn connection(&self) -> &Connection {
        &self.conn
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

    // ---- P1.3 cost ledger (A9) -----------------------------------------

    /// Append one `token_usage` row (single write owner — the vault).
    pub fn record_usage(&self, row: &UsageRow) -> Result<(), VaultError> {
        self.conn.execute(
            "INSERT INTO token_usage
                (ts, session, provider, model, key_id, in_tokens, out_tokens,
                 cache_read, cache_write, cost, tool)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                now_ms(),
                row.session,
                row.provider,
                row.model,
                row.key_id,
                row.usage.prompt as i64,
                row.usage.output as i64,
                row.usage.cache_read as i64,
                row.usage.cache_write as i64,
                row.cost,
                row.tool,
            ],
        )?;
        Ok(())
    }

    /// Total $ spent by a session (SUM over the ledger — the durable side of
    /// the in-memory [`SessionBudget`]).
    pub fn session_spend(&self, session: &str) -> Result<f64, VaultError> {
        let total: f64 = self
            .conn
            .query_row(
                "SELECT COALESCE(SUM(cost), 0.0) FROM token_usage WHERE session = ?1",
                [session],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(0.0);
        Ok(total)
    }

    /// Number of ledger rows (tests/telemetry).
    pub fn ledger_count(&self) -> Result<u64, VaultError> {
        let n: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM token_usage", [], |r| r.get(0))?;
        Ok(n as u64)
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
            assert!(vault.status().contains("schema v4"));
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
    fn stale_v1_schema_gets_bumped_to_v4_on_open() {
        // A P0.1-era DB has schema_version=1 and no key_ring/token_usage.
        // Opening it with the v4 code must create the new tables AND bump the
        // recorded version so status() never reports a stale version.
        let dir =
            std::env::temp_dir().join(format!("everyaios-vault-migrate-{}", std::process::id()));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);

        // Simulate a v1 DB: open, force the version row back to 1.
        {
            let vault = Vault::open(&path, "test-key").expect("open");
            vault
                .conn
                .execute(
                    "UPDATE schema_meta SET value = '1' WHERE key = 'schema_version'",
                    [],
                )
                .unwrap();
            assert!(vault.status().contains("schema v1"));
        }
        // Reopen: version row must be bumped to the current schema.
        {
            let vault = Vault::open(&path, "test-key").expect("reopen");
            assert!(vault.status().contains("schema v4"));
            assert!(vault.ledger_count().unwrap() == 0);
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ledger_records_rows_and_session_spend() {
        let vault = Vault::open_in_memory("mem-key").expect("open");
        let usage = Usage {
            prompt: 100,
            output: 40,
            cache_read: 60,
            cache_write: 0,
        };
        vault
            .record_usage(&UsageRow {
                session: "s-1".into(),
                provider: "openai".into(),
                model: "gpt-4o".into(),
                key_id: "prod-1".into(),
                usage,
                cost: 0.0012,
                tool: None,
            })
            .unwrap();
        vault
            .record_usage(&UsageRow {
                session: "s-1".into(),
                provider: "openai".into(),
                model: "gpt-4o".into(),
                key_id: "prod-1".into(),
                usage: Usage::default(),
                cost: 0.0008,
                tool: Some("files.read".into()),
            })
            .unwrap();
        vault
            .record_usage(&UsageRow {
                session: "s-2".into(),
                provider: "deepseek".into(),
                model: "deepseek-chat".into(),
                key_id: "dsk-1".into(),
                usage: Usage::default(),
                cost: 0.01,
                tool: None,
            })
            .unwrap();

        assert_eq!(vault.ledger_count().unwrap(), 3);
        // Session spend is per-session (SUM over the ledger).
        assert!((vault.session_spend("s-1").unwrap() - 0.0020).abs() < 1e-12);
        assert!((vault.session_spend("s-2").unwrap() - 0.01).abs() < 1e-12);
        assert_eq!(vault.session_spend("s-none").unwrap(), 0.0);
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
