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

pub mod auth_bridge;
pub mod broker;
pub mod credential_broker;
pub mod egress;
pub mod keyring;
pub mod ledger;
pub mod local;
pub mod oauth;
pub mod session;
pub mod session_budget;
pub mod tier;

pub use broker::{
    assemble_tool_calls, extract_json_tool_calls, usage_tokens, Broker, BrokerError,
    ChatStreamEvent, ToolCallDelta,
};
pub use credential_broker::{
    AllowlistApprover, CredentialBroker, CredentialFillError, CredentialHandle, DenyAllApprover,
    FillApprover, FillReceipt, FillSink, FillTarget,
};
pub use egress::{EgressFirewall, EgressPolicy, EgressVerdict};
pub use keyring::{
    KeyEntry, KeyInfo, KeyRing, KeyRingError, KeySpec, KeyStatus, RoutingPolicy, SelectedKey,
    COOLDOWN_BASE_SECS, COOLDOWN_CAP_SECS, MAX_429_SWITCHES,
};
pub use ledger::{default_pricing, Pricing, RecentUsage, SessionTotal, Usage, UsageRow};
pub use local::{Grammar, LocalEndpoint, LocalRuntime, DEFAULT_NUM_CTX, MIN_WARN_NUM_CTX};
pub use oauth::{
    DeviceCodeStart, DevicePoll, OAuthAccountInfo, OAuthError, OAuthManager, PkceStart,
};
pub use session::{
    AuthHeader, CaptureInput, Cookie, SessionContext, SessionError, SessionRecord, SessionStatus,
    SessionUse, SessionVault, StorageItem, StorageKind, TrustLevel,
};
pub use session_budget::{SessionBudget, DEFAULT_SESSION_BUDGET_USD};
pub use tier::{
    escalate_by_floor, mode_weights, parse_auto_model, score, shortest_path_chain, RoutingStrategy,
    TaskClass, TierConfig, TierDecision, TierMode, TierRole,
};

use std::path::Path;

use rusqlite::{Connection, OptionalExtension};

const SCHEMA_VERSION: i64 = 7;

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
-- P51.12: `task_id`/`run_id`/`work_id` scope rows to detached work (the
-- task-cost join carrier). NOT NULL DEFAULT '' so pre-P51.12 rows stay valid;
-- pre-existing DBs gain the columns via `ensure_token_usage_scope_columns`
-- (CREATE TABLE IF NOT EXISTS alone never alters an existing table).
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
    tool         TEXT,
    task_id      TEXT NOT NULL DEFAULT '',
    run_id       TEXT NOT NULL DEFAULT '',
    work_id      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session);
CREATE INDEX IF NOT EXISTS idx_token_usage_ts ON token_usage(ts);
CREATE INDEX IF NOT EXISTS idx_token_usage_task ON token_usage(task_id);

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

-- P2.7 (E11/E7/E13, ARCH/08 §8.9): Session Vault — per-site full storage
-- context (cookies + localStorage/sessionStorage/IndexedDB + auth headers),
-- multi-account, permission-gated, usage-audited. The agent only ever sees
-- the opaque `id` + metadata (SessionRecord); raw values flow only through
-- the injection path (SessionContext) behind a Trust-Ladder grant.
CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    site         TEXT NOT NULL,
    account      TEXT NOT NULL,
    persist      INTEGER NOT NULL DEFAULT 0,
    trust_level  TEXT NOT NULL DEFAULT 'read_only',
    status       TEXT NOT NULL DEFAULT 'active',
    expires_at   INTEGER,
    last_used_at INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    UNIQUE(site, account)
);
CREATE INDEX IF NOT EXISTS idx_sessions_site ON sessions(site);

CREATE TABLE IF NOT EXISTS session_cookies (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    value      BLOB NOT NULL,
    domain     TEXT NOT NULL DEFAULT '',
    path       TEXT NOT NULL DEFAULT '/',
    expires    INTEGER,
    http_only  INTEGER NOT NULL DEFAULT 0,
    secure     INTEGER NOT NULL DEFAULT 0,
    same_site  TEXT NOT NULL DEFAULT 'Lax',
    PRIMARY KEY (session_id, name, domain, path)
);

CREATE TABLE IF NOT EXISTS session_storage (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      BLOB NOT NULL,
    PRIMARY KEY (session_id, kind, key)
);

CREATE TABLE IF NOT EXISTS session_headers (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    value      BLOB NOT NULL,
    PRIMARY KEY (session_id, name)
);

CREATE TABLE IF NOT EXISTS session_grants (
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id      TEXT NOT NULL,
    granted_level TEXT NOT NULL,
    granted_at    INTEGER NOT NULL,
    PRIMARY KEY (session_id, agent_id)
);

CREATE TABLE IF NOT EXISTS session_uses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    agent_session TEXT NOT NULL,
    action        TEXT NOT NULL,
    ts            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_uses_session ON session_uses(session_id);

-- H4 leftover: UI sessions persist inside SQLCipher (Codex/Claude JSONL analog).
CREATE TABLE IF NOT EXISTS ui_sessions (
    id         TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
"#;

/// An open SQLCipher vault handle. Not `Clone` — ownership is the point.
pub struct Vault {
    conn: Connection,
}

impl Vault {
    /// Open (or create) an encrypted database at `path`.
    ///
    /// `key` is the raw encryption key. Production key management lives in
    /// `everyaios-core::vault_key` (H4/R7: env → keyfile → passphrase+Argon2id,
    /// `NeedsSetup` unless `EVERYAIOS_ALLOW_GENERATED_KEY` — never a silent
    /// generated key); this crate only stores/uses the derived SQLCipher key.
    pub fn open(path: &Path, key: &str) -> Result<Self, VaultError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(VaultError::Io)?;
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "key", key)?;
        conn.pragma_update(None, "cipher_page_size", 4096)?;
        ensure_token_usage_scope_columns(&conn)?;
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
        ensure_token_usage_scope_columns(&conn)?;
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

    /// Persist one UI session JSON blob (encrypted at rest).
    pub fn put_ui_session(&self, id: &str, payload: &str) -> Result<(), VaultError> {
        self.conn.execute(
            "INSERT INTO ui_sessions (id, payload, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
            rusqlite::params![id, payload, now_ms()],
        )?;
        Ok(())
    }

    pub fn get_ui_session(&self, id: &str) -> Result<Option<String>, VaultError> {
        let row = self
            .conn
            .query_row("SELECT payload FROM ui_sessions WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?;
        Ok(row)
    }

    pub fn list_ui_sessions(&self) -> Result<Vec<(String, String)>, VaultError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, payload FROM ui_sessions ORDER BY updated_at DESC")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn delete_ui_session(&self, id: &str) -> Result<(), VaultError> {
        self.conn
            .execute("DELETE FROM ui_sessions WHERE id = ?1", [id])?;
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
    /// The row carries its own P51.12 scope (`task_id`/`run_id`/`work_id`;
    /// `""` = unscoped broker turn).
    pub fn record_usage(&self, row: &UsageRow) -> Result<(), VaultError> {
        self.conn.execute(
            "INSERT INTO token_usage
                (ts, session, provider, model, key_id, in_tokens, out_tokens,
                 cache_read, cache_write, cost, tool, task_id, run_id, work_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                row.task_id,
                row.run_id,
                row.work_id,
            ],
        )?;
        Ok(())
    }

    /// Append one scoped `token_usage` row: `row` supplies the call fields,
    /// the three `&str` params supply the P51.12 cost-carrier scope. Thin
    /// wrapper over [`Self::record_usage`] so existing unscoped callers keep
    /// compiling unchanged.
    pub fn record_usage_scoped(
        &self,
        row: &UsageRow,
        task_id: &str,
        run_id: &str,
        work_id: &str,
    ) -> Result<(), VaultError> {
        let mut scoped = row.clone();
        scoped.task_id = task_id.to_string();
        scoped.run_id = run_id.to_string();
        scoped.work_id = work_id.to_string();
        self.record_usage(&scoped)
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

    /// Last `limit` ledger rows newest-first — the durable observation feed
    /// for the coordinator's RouteDecision scorer (ARCH/05 seam:
    /// `token_usage` → `ProviderObservation`, restart/offline survival).
    /// Latency is not stored (the broker records only tokens+cost), so the
    /// coordinator merges these rows into its ring without overwriting the
    /// live process's latency/health signals.
    pub fn recent_usage(&self, limit: u64) -> Result<Vec<RecentUsage>, VaultError> {
        let limit = (limit.min(500) as i64).max(1);
        let mut stmt = self.conn.prepare(
            "SELECT ts, provider, model, in_tokens, out_tokens, cache_read, cache_write, cost
             FROM token_usage
             ORDER BY id DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |r| {
            Ok(RecentUsage {
                ts_ms: r.get(0)?,
                provider: r.get(1)?,
                model: r.get(2)?,
                in_tokens: r.get::<_, i64>(3)?.max(0) as u64,
                out_tokens: r.get::<_, i64>(4)?.max(0) as u64,
                cache_read: r.get::<_, i64>(5)?.max(0) as u64,
                cache_write: r.get::<_, i64>(6)?.max(0) as u64,
                cost: r.get(7)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// P51.12 task-cost join (carrier read side): every ledger row scoped to
    /// `task_id`, newest-first. Feeds `task_cost` and, across the crate
    /// boundary, `TaskRecord::attach_cost`.
    pub fn usage_for_task(&self, task_id: &str) -> Result<Vec<UsageRow>, VaultError> {
        let mut stmt = self.conn.prepare(
            "SELECT session, provider, model, key_id,
                    in_tokens, out_tokens, cache_read, cache_write, cost, tool,
                    task_id, run_id, work_id
             FROM token_usage
             WHERE task_id = ?1
             ORDER BY id DESC",
        )?;
        let rows = stmt.query_map([task_id], |r| {
            Ok(UsageRow {
                session: r.get(0)?,
                provider: r.get(1)?,
                model: r.get(2)?,
                key_id: r.get(3)?,
                usage: crate::ledger::Usage {
                    prompt: r.get::<_, i64>(4)?.max(0) as u64,
                    output: r.get::<_, i64>(5)?.max(0) as u64,
                    cache_read: r.get::<_, i64>(6)?.max(0) as u64,
                    cache_write: r.get::<_, i64>(7)?.max(0) as u64,
                },
                cost: r.get(8)?,
                tool: r.get(9)?,
                task_id: r.get(10)?,
                run_id: r.get(11)?,
                work_id: r.get(12)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// P51.12 task-cost join (aggregate side): `(in_tokens, out_tokens, cost)`
    /// summed over every row scoped to `task_id`. Unknown tasks sum to zero —
    /// never an error.
    pub fn task_cost(&self, task_id: &str) -> Result<(u64, u64, f64), VaultError> {
        let (in_sum, out_sum, cost_sum): (i64, i64, f64) = self
            .conn
            .query_row(
                "SELECT COALESCE(SUM(in_tokens), 0),
                        COALESCE(SUM(out_tokens), 0),
                        COALESCE(SUM(cost), 0.0)
                 FROM token_usage WHERE task_id = ?1",
                [task_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?
            .unwrap_or((0, 0, 0.0));
        Ok((in_sum.max(0) as u64, out_sum.max(0) as u64, cost_sum))
    }

    /// Per-session cost/token breakdown for the analytics table (P5.9) — the
    /// `token_usage` ledger grouped by session, most-expensive first.
    pub fn session_totals(&self) -> Result<Vec<SessionTotal>, VaultError> {
        let mut stmt = self.conn.prepare(
            "SELECT session,
                    COALESCE(SUM(in_tokens), 0),
                    COALESCE(SUM(out_tokens), 0),
                    COALESCE(SUM(cost), 0.0)
             FROM token_usage
             GROUP BY session
             ORDER BY SUM(cost) DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(SessionTotal {
                session: r.get(0)?,
                tokens_in: r.get::<_, i64>(1)?.max(0) as u64,
                tokens_out: r.get::<_, i64>(2)?.max(0) as u64,
                cost: r.get(3)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }
}

/// P51.12 migration: `CREATE TABLE IF NOT EXISTS` never alters an existing
/// table, so pre-P51.12 databases gain the cost-carrier scope columns here.
/// `ADD COLUMN ... NOT NULL DEFAULT ''` keeps every old row valid (reads back
/// as unscoped `""`). Idempotent — safe to run on every open.
///
/// Runs BEFORE `INIT_SQL`: the batch now contains an index on `task_id`,
/// which would fail against a legacy table that lacks the column. Missing
/// tables are left alone (fresh DBs get the v7 shape from `INIT_SQL`).
fn ensure_token_usage_scope_columns(conn: &Connection) -> Result<(), VaultError> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'",
            [],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or(false);
    if !exists {
        return Ok(());
    }
    let mut stmt = conn.prepare("PRAGMA table_info(token_usage)")?;
    let cols = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    for col in ["task_id", "run_id", "work_id"] {
        if !cols.iter().any(|c| c == col) {
            conn.execute(
                &format!("ALTER TABLE token_usage ADD COLUMN {col} TEXT NOT NULL DEFAULT ''"),
                [],
            )?;
        }
    }
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_token_usage_task ON token_usage(task_id)",
        [],
    )?;
    Ok(())
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

    /// P45.1 acceptance — the SQLCipher **vault is untouched** by the
    /// non-vault pragma tuning: it must keep its safer `synchronous` default
    /// (FULL, not NORMAL) and its default journal_size_limit. Credentials
    /// must not trade durability for write throughput.
    #[test]
    fn vault_keeps_safe_pragma_defaults_untouched() {
        let dir = std::env::temp_dir().join(format!(
            "everyaios-vault-pragma-test-{}",
            std::process::id()
        ));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);
        {
            let vault = Vault::open(&path, "test-key").expect("open");
            vault.register_key("anthropic", "key-1").unwrap();
            let sync: i64 = vault
                .conn
                .query_row("PRAGMA synchronous;", [], |r| r.get(0))
                .unwrap();
            assert_eq!(
                sync, 2,
                "vault must stay synchronous=FULL (2), never NORMAL (1)"
            );
            let limit: i64 = vault
                .conn
                .query_row("PRAGMA journal_size_limit;", [], |r| r.get(0))
                .unwrap();
            assert_ne!(
                limit, 67_108_864,
                "vault must keep its default journal_size_limit"
            );
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_create_and_roundtrip() {
        let dir = std::env::temp_dir().join(format!("everyaios-vault-test-{}", std::process::id()));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);

        {
            let vault = Vault::open(&path, "test-key").expect("open");
            assert!(vault.status().contains("schema v7"));
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

    /// P10.4 — SQLCipher vault is a portable byte file: the database is
    /// self-contained (no absolute paths, no host-specific handles), encrypted
    /// at rest (plaintext markers never appear in the file), and reopens with
    /// only the key on any OS. This test runs in the CI matrix on all three
    /// platforms — "copy vault.db between OS" is the same bytes + the same key.
    #[test]
    fn portable_encrypted_bytes_reopen_with_only_the_key() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-vault-portable-{}", std::process::id()));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let secret = "sk-portable-secret-42";
        {
            let vault = Vault::open(&path, "test-key").expect("open");
            vault.register_key("anthropic", secret).unwrap();
            vault
                .put_ui_session("portable", r#"{"id":"portable","title":"x"}"#)
                .unwrap();
        }
        // Drop the handle: everything durable is now only the file bytes.

        // 1. The file is encrypted at rest — the secret must never appear
        //    in plaintext bytes (SQLCipher page encryption).
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.is_empty(), "vault file must exist and be non-empty");
        let haystack = String::from_utf8_lossy(&raw);
        assert!(
            !haystack.contains(secret),
            "vault file must not contain plaintext key material"
        );
        // The standard SQLCipher header magic is not a plain SQLite one; the
        // schema marker "sqlcipher" may appear in the header bytes — presence
        // of the KDF salt bytes is what matters, and the encryption assertion
        // above is the load-bearing one.

        // 2. Reopen from the same bytes with only the key (the cross-OS
        //    contract: same file + same key, any platform).
        {
            let vault = Vault::open(&path, "test-key").expect("reopen portable bytes");
            assert!(vault.verify_key().unwrap());
            assert_eq!(
                vault.list_keys("anthropic").unwrap(),
                vec![secret.to_string()]
            );
            let sessions = vault.list_ui_sessions().unwrap();
            assert_eq!(sessions.len(), 1);
            assert_eq!(sessions[0].0, "portable");
        }

        // 3. Wrong key fails closed. SQLCipher refuses the wrong key at open
        //    (NotADatabase — the header salt can't decrypt), and even in the
        //    cases where open succeeds the verify_key probe must return false.
        let wrong = Vault::open(&path, "wrong-key");
        match wrong {
            Err(_) => { /* fail-closed at open: SQLCipher refuses */ }
            Ok(v) => assert!(!v.verify_key().unwrap(), "wrong key must not verify"),
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// P50.2.1 — runtime truth for the session list: a fresh vault lists ZERO
    /// sessions (never a seeded demo row); a malformed payload row drops
    /// cleanly at the parse boundary (the Tauri `session_list` command
    /// filter-maps `serde_json::from_str(...).ok()`), and delete removes the
    /// row so no orphan remains. The vault itself stores raw payloads — the
    /// sample-chat seed lives in the UI preview only, never here.
    #[test]
    fn session_list_empty_malformed_and_delete() {
        let vault = Vault::open_in_memory("mem-key").expect("open");

        // 1. Fresh vault → empty list (no seeding).
        let empty = vault.list_ui_sessions().unwrap();
        assert!(empty.is_empty(), "fresh vault must list zero sessions");

        // 2. Malformed payload: stored raw in the vault; the consumer-side
        //    parse boundary drops it (mirrors the Tauri session_list filter).
        vault.put_ui_session("broken", "this is not json").unwrap();
        let raw = vault.list_ui_sessions().unwrap();
        assert_eq!(raw.len(), 1);
        assert_eq!(raw[0].0, "broken");
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(&raw[0].1);
        assert!(parsed.is_err(), "malformed payload must fail to parse");
        let dropped: Vec<_> = raw
            .iter()
            .filter_map(|(_, p)| serde_json::from_str::<serde_json::Value>(p).ok())
            .collect();
        assert!(
            dropped.is_empty(),
            "malformed rows must be dropped, never surfaced"
        );

        // 3. Healthy row alongside the broken one: only the parseable row
        //    surfaces through the consumer filter.
        vault
            .put_ui_session("good", r#"{"id":"good","title":"hi"}"#)
            .unwrap();
        let mixed = vault.list_ui_sessions().unwrap();
        assert_eq!(mixed.len(), 2);
        let surfaced: Vec<_> = mixed
            .iter()
            .filter_map(|(_, p)| serde_json::from_str::<serde_json::Value>(p).ok())
            .collect();
        assert_eq!(surfaced.len(), 1);
        assert_eq!(surfaced[0]["id"], "good");

        // 4. Delete removes the row completely (no orphan).
        vault.delete_ui_session("broken").unwrap();
        vault.delete_ui_session("good").unwrap();
        assert!(vault.list_ui_sessions().unwrap().is_empty());
    }

    #[test]
    fn in_memory_roundtrip() {
        let vault = Vault::open_in_memory("mem-key").expect("open");
        vault.register_key("deepseek", "dsk-1").unwrap();
        assert_eq!(
            vault.list_keys("deepseek").unwrap(),
            vec!["dsk-1".to_string()]
        );
        vault
            .put_ui_session("s1", r#"{"id":"s1","title":"hi"}"#)
            .unwrap();
        let list = vault.list_ui_sessions().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].0, "s1");
    }

    #[test]
    fn stale_v1_schema_gets_bumped_to_v5_on_open() {
        // A P0.1-era DB has schema_version=1 and no key_ring/token_usage.
        // Opening it must create the new tables AND bump the recorded version.
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
            assert!(vault.status().contains("schema v7"));
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
                task_id: "".into(),
                run_id: "".into(),
                work_id: "".into(),
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
                task_id: "".into(),
                run_id: "".into(),
                work_id: "".into(),
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
                task_id: "".into(),
                run_id: "".into(),
                work_id: "".into(),
            })
            .unwrap();

        assert_eq!(vault.ledger_count().unwrap(), 3);
        // Session spend is per-session (SUM over the ledger).
        assert!((vault.session_spend("s-1").unwrap() - 0.0020).abs() < 1e-12);
        assert!((vault.session_spend("s-2").unwrap() - 0.01).abs() < 1e-12);
        assert_eq!(vault.session_spend("s-none").unwrap(), 0.0);

        // P5.9 — per-session totals aggregate the ledger by session.
        let totals = vault.session_totals().unwrap();
        assert_eq!(totals.len(), 2);
        // Most-expensive session first (s-2 = $0.01 > s-1 = $0.002).
        assert_eq!(totals[0].session, "s-2");
        assert!((totals[0].cost - 0.01).abs() < 1e-12);
        assert_eq!(totals[1].session, "s-1");
        assert_eq!(totals[1].tokens_in, 100);
        assert!((totals[1].cost - 0.0020).abs() < 1e-12);
    }

    /// P50.2.5 — durable analytics aggregates: `session_totals` is a
    /// query-time aggregate of the durable `token_usage` ledger, so (a) a
    /// fresh vault aggregates to ZERO rows (never a synthetic dashboard) and
    /// (b) the totals survive a vault reopen with the same key — the
    /// aggregate is derived from persisted bytes, not session memory.
    #[test]
    fn session_totals_are_empty_fresh_and_durable_across_reopen() {
        let dir = std::env::temp_dir().join(format!("everyaios-vault-agg-{}", std::process::id()));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Fresh vault → zero aggregate rows (zero activity renders zero).
        {
            let vault = Vault::open(&path, "agg-key").expect("open");
            assert!(vault.session_totals().unwrap().is_empty());
            for _ in 0..3 {
                vault
                    .record_usage(&UsageRow {
                        session: "agg-1".into(),
                        provider: "openai".into(),
                        model: "gpt-4o".into(),
                        key_id: "k".into(),
                        usage: Usage {
                            prompt: 100,
                            output: 40,
                            cache_read: 0,
                            cache_write: 0,
                        },
                        cost: 0.0005,
                        tool: None,
                        task_id: "".into(),
                        run_id: "".into(),
                        work_id: "".into(),
                    })
                    .unwrap();
            }
            vault
                .record_usage(&UsageRow {
                    session: "agg-2".into(),
                    provider: "deepseek".into(),
                    model: "deepseek-chat".into(),
                    key_id: "k".into(),
                    usage: Usage::default(),
                    cost: 0.02,
                    tool: None,
                    task_id: "".into(),
                    run_id: "".into(),
                    work_id: "".into(),
                })
                .unwrap();
            let totals = vault.session_totals().unwrap();
            assert_eq!(totals.len(), 2);
            assert_eq!(totals[0].session, "agg-2"); // most expensive first
            assert_eq!(totals[1].session, "agg-1");
            assert_eq!(totals[1].tokens_in, 300);
            assert!((totals[1].cost - 0.0015).abs() < 1e-12);
        }

        // Reopen with the SAME key: the aggregate is byte-derived from the
        // ledger and must be unchanged (durable across app restarts).
        {
            let vault = Vault::open(&path, "agg-key").expect("reopen");
            let totals = vault.session_totals().unwrap();
            assert_eq!(totals.len(), 2);
            assert_eq!(totals[0].session, "agg-2");
            assert_eq!(totals[1].session, "agg-1");
            assert_eq!(totals[1].tokens_in, 300);
            assert!((totals[1].cost - 0.0015).abs() < 1e-12);
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn recent_usage_feeds_the_coordinator_observation_ring() {
        let vault = Vault::open_in_memory("mem-key").expect("open");
        // Five calls on one model, plus one call on another provider.
        for i in 0..5 {
            vault
                .record_usage(&UsageRow {
                    session: "s-1".into(),
                    provider: "openai".into(),
                    model: "gpt-4o".into(),
                    key_id: "k1".into(),
                    usage: Usage {
                        prompt: 100 + i,
                        output: 40,
                        cache_read: 0,
                        cache_write: 0,
                    },
                    cost: 0.001,
                    tool: None,
                    task_id: "".into(),
                    run_id: "".into(),
                    work_id: "".into(),
                })
                .unwrap();
        }
        vault
            .record_usage(&UsageRow {
                session: "s-2".into(),
                provider: "deepseek".into(),
                model: "deepseek-chat".into(),
                key_id: "dsk-1".into(),
                usage: Usage {
                    prompt: 10,
                    output: 5,
                    cache_read: 0,
                    cache_write: 0,
                },
                cost: 0.0001,
                tool: None,
                task_id: "".into(),
                run_id: "".into(),
                work_id: "".into(),
            })
            .unwrap();

        // Newest-first with the requested limit.
        let rows = vault.recent_usage(3).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].model, "deepseek-chat"); // newest row
        assert_eq!(rows[1].in_tokens, 104); // newest openai call
        assert_eq!(rows[0].provider, "deepseek");
        // Provider/model columns are present — the ring's durable key.
        assert!(rows
            .iter()
            .all(|r| !r.provider.is_empty() && !r.model.is_empty()));

        // Limit clamps: 0 → 1, huge → 500.
        assert_eq!(vault.recent_usage(0).unwrap().len(), 1);
        assert_eq!(vault.recent_usage(10_000).unwrap().len(), 6);

        // camelCase wire shape (what the coordinator consumes).
        let v = serde_json::to_value(&rows[0]).unwrap();
        assert!(v.get("tsMs").is_some());
        assert!(v.get("inTokens").is_some());
        assert!(v.get("outTokens").is_some());
        assert!(v.get("cost").is_some());
    }

    /// P51.12 — the task-cost join carrier: scoped rows round-trip through
    /// `usage_for_task`, and `task_cost` sums (in, out, $) across rows. Rows
    /// scoped to other tasks (or unscoped `""`) never leak into the join.
    #[test]
    fn ledger_cost_carrier_joins_task() {
        let vault = Vault::open_in_memory("mem-key").expect("open");
        let base = UsageRow {
            session: "s-join".into(),
            provider: "openai".into(),
            model: "gpt-4o".into(),
            key_id: "k".into(),
            usage: Usage {
                prompt: 100,
                output: 40,
                cache_read: 0,
                cache_write: 0,
            },
            cost: 0.001,
            tool: None,
            task_id: "".into(),
            run_id: "".into(),
            work_id: "".into(),
        };
        // Two rows for task-7 (distinct run/work scope), one for another
        // task, one unscoped broker turn.
        vault
            .record_usage_scoped(&base, "task-7", "run-a", "work-1")
            .unwrap();
        let mut second = base.clone();
        second.usage = Usage {
            prompt: 50,
            output: 10,
            cache_read: 0,
            cache_write: 0,
        };
        second.cost = 0.0005;
        vault
            .record_usage_scoped(&second, "task-7", "run-b", "work-2")
            .unwrap();
        vault
            .record_usage_scoped(&base, "task-9", "run-a", "work-1")
            .unwrap();
        vault.record_usage(&base).unwrap();

        let rows = vault.usage_for_task("task-7").unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.task_id == "task-7"));
        let mut run_ids: Vec<&str> = rows.iter().map(|r| r.run_id.as_str()).collect();
        run_ids.sort_unstable();
        assert_eq!(run_ids, vec!["run-a", "run-b"]);

        let (tin, tout, cost) = vault.task_cost("task-7").unwrap();
        assert_eq!(tin, 150);
        assert_eq!(tout, 50);
        assert!((cost - 0.0015).abs() < 1e-12);

        // Other tasks and unscoped rows are excluded from this join.
        assert_eq!(vault.usage_for_task("task-9").unwrap().len(), 1);
        assert_eq!(vault.usage_for_task("").unwrap().len(), 1);
        assert_eq!(vault.usage_for_task("task-none").unwrap(), Vec::new());
        assert_eq!(vault.task_cost("task-none").unwrap(), (0, 0, 0.0));
    }

    /// P51.12 migration compat: a pre-P51.12 database file (a `token_usage`
    /// table WITHOUT the scope columns) opens cleanly — the columns are added
    /// with `DEFAULT ''`, the legacy row reads back unscoped, and new scoped
    /// writes work on the migrated table.
    #[test]
    fn old_rows_read_with_empty_task_id() {
        let dir =
            std::env::temp_dir().join(format!("everyaios-vault-scope-mig-{}", std::process::id()));
        let path = dir.join("vault.db");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Forge a legacy DB: the exact pre-P51.12 `token_usage` shape (no
        // task_id/run_id/work_id) plus one spend row.
        {
            let conn = rusqlite::Connection::open(&path).unwrap();
            conn.pragma_update(None, "key", "mig-key").unwrap();
            conn.pragma_update(None, "cipher_page_size", 4096).unwrap();
            conn.execute_batch(
                "CREATE TABLE token_usage (
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
                INSERT INTO token_usage
                    (ts, session, provider, model, key_id, in_tokens, out_tokens,
                     cache_read, cache_write, cost, tool)
                VALUES (1, 's-old', 'openai', 'gpt-4o', 'k', 100, 40, 0, 0, 0.001, NULL);",
            )
            .unwrap();
        }

        // Opening migrates (adds the scope columns) and bumps the version.
        {
            let vault = Vault::open(&path, "mig-key").expect("open migrates legacy db");
            assert!(vault.status().contains("schema v7"));
            assert_eq!(vault.ledger_count().unwrap(), 1);
            // Legacy row reads back with empty scope — old rows stay valid.
            let unscoped = vault.usage_for_task("").unwrap();
            assert_eq!(unscoped.len(), 1);
            assert_eq!(unscoped[0].session, "s-old");
            assert_eq!(unscoped[0].task_id, "");
            assert_eq!(unscoped[0].run_id, "");
            assert_eq!(unscoped[0].work_id, "");
            let (tin, tout, cost) = vault.task_cost("").unwrap();
            assert_eq!((tin, tout), (100, 40));
            assert!((cost - 0.001).abs() < 1e-12);
            // New scoped writes land on the migrated table.
            vault
                .record_usage(&UsageRow {
                    session: "s-old".into(),
                    provider: "openai".into(),
                    model: "gpt-4o".into(),
                    key_id: "k".into(),
                    usage: Usage {
                        prompt: 10,
                        output: 5,
                        cache_read: 0,
                        cache_write: 0,
                    },
                    cost: 0.0001,
                    tool: None,
                    task_id: "task-1".into(),
                    run_id: "run-1".into(),
                    work_id: "work-1".into(),
                })
                .unwrap();
            assert_eq!(vault.usage_for_task("task-1").unwrap().len(), 1);
        }

        let _ = std::fs::remove_dir_all(&dir);
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
