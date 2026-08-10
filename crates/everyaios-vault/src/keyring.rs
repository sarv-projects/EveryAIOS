//! Key-ring vault (P1.1, A2/A3, J8) — SQLCipher key pools behind opaque handles.
//!
//! The vault stores each provider's key pool as encrypted rows. Every key gets
//! a random 128-bit **opaque handle** (doc 53 §2) at ingest; the TS sidecar
//! only ever sees handles — never the raw secret (CES sealed channel). The
//! broker in this crate resolves handles and executes HTTP calls.
//!
//! Selection engine (all in the broker's choke point, so a misbehaving sidecar
//! cannot bypass rate limits by holding its own key):
//! - **Status tiers:** `primary` / `standby` selected normally; `backup` only
//!   when no primary/standby is eligible; `suspended` never selected.
//! - **Routing policies:** `priority` (lowest number first), `round-robin`,
//!   `least-used` (min daily tokens).
//! - **model_filter:** a key only serves models in its list (empty = any).
//! - **Cooldown:** a 429 puts the key in cooldown for `base × 2^failures`
//!   seconds, capped at 5 minutes.
//! - **Budgets:** per-key `tokens_day` / `cost_day` with optional caps; daily
//!   counters roll over lazily on first use of a new day.
//! - **Affinity:** `(provider, model, session_id)` pins to one key so cached
//!   contexts reuse the same credential.
//! - **Health:** `success_count` / `fail_count` / `last_used_at` tracked per
//!   key and surfaced (handle-only) to the sidecar.

use std::collections::HashMap;
use std::sync::Mutex;

use rand::RngCore;
use rusqlite::{Connection, OptionalExtension, Row};
use zeroize::Zeroize;

use crate::Vault;

/// 429 backoff base in seconds; delay = `base × 2^failures`, capped.
pub const COOLDOWN_BASE_SECS: u64 = 5;
/// Hard cap for 429 backoff (5 minutes).
pub const COOLDOWN_CAP_SECS: u64 = 300;

/// Default maximum 429 failover switches per call (P1.1).
pub const MAX_429_SWITCHES: u32 = 3;

/// Key status tier. Only `Primary`/`Standby` are selected normally; `Backup`
/// is the last-resort tier; `Suspended` is never selected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyStatus {
    Primary,
    Standby,
    Backup,
    Suspended,
}

impl KeyStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Primary => "primary",
            Self::Standby => "standby",
            Self::Backup => "backup",
            Self::Suspended => "suspended",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "primary" => Some(Self::Primary),
            "standby" => Some(Self::Standby),
            "backup" => Some(Self::Backup),
            "suspended" => Some(Self::Suspended),
            _ => None,
        }
    }
}

/// Routing policy used by the selection engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoutingPolicy {
    Priority,
    RoundRobin,
    LeastUsed,
}

/// Spec for adding a key to the ring.
pub struct KeySpec {
    pub provider: String,
    pub key_id: String,
    /// The raw secret bytes (stored encrypted at rest; zeroized on drop).
    pub value: Vec<u8>,
    pub status: KeyStatus,
    /// Restrict this key to these models (empty = any model).
    pub model_filter: Vec<String>,
    /// Lower = higher priority (default 100).
    pub priority: u32,
    pub daily_token_cap: Option<u64>,
    pub daily_cost_cap: Option<f64>,
}

/// A full key row as stored in the ring. `value` is `pub(crate)` — only the
/// broker (same crate) may touch the raw secret; the public surface returns
/// [`KeyInfo`] which never contains it. Clones are safe: every copy is
/// zeroized by [`Drop`].
#[derive(Debug, Clone)]
pub struct KeyEntry {
    // `id` / `fail_count` / `success_count` are populated from the DB and
    // surfaced through [`KeyInfo`]; the health counters are also asserted by
    // the unit tests. They are not read by name inside the lib itself, so
    // silence the target-scoped dead-code lint.
    #[allow(dead_code)]
    pub(crate) id: i64,
    pub(crate) provider: String,
    pub(crate) key_id: String,
    pub(crate) opaque_handle: String,
    pub(crate) value: Vec<u8>,
    pub(crate) status: KeyStatus,
    pub(crate) model_filter: Vec<String>,
    pub(crate) priority: u32,
    pub(crate) tokens_day: u64,
    pub(crate) cost_day: f64,
    pub(crate) daily_token_cap: Option<u64>,
    pub(crate) daily_cost_cap: Option<f64>,
    #[allow(dead_code)]
    pub(crate) fail_count: u64,
    #[allow(dead_code)]
    pub(crate) success_count: u64,
    pub(crate) last_used_at: i64,
    pub(crate) cooldown_until: i64,
}

impl Drop for KeyEntry {
    fn drop(&mut self) {
        self.value.zeroize();
    }
}

/// Handle-only view of a key (what the sidecar may see). Never carries the
/// secret — the sealed-channel guarantee is enforced by construction.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub provider: String,
    pub key_id: String,
    /// Opaque 128-bit handle — the only credential reference the sidecar holds.
    pub opaque_handle: String,
    pub status: String,
    pub model_filter: Vec<String>,
    pub priority: u32,
    pub tokens_day: u64,
    pub cost_day: f64,
    pub daily_token_cap: Option<u64>,
    pub daily_cost_cap: Option<f64>,
    pub fail_count: u64,
    pub success_count: u64,
    pub last_used_at: i64,
    pub cooldown_until: i64,
    /// True while the key is in a 429 cooldown.
    pub in_cooldown: bool,
}

/// A key selected for a request. The broker consumes `value` inside the crate
/// and scrubs it on drop; nothing of it ever crosses the crate boundary.
pub struct SelectedKey {
    pub(crate) provider: String,
    // Read by the broker's auth header + tests; the lib's non-test build
    // never names it directly.
    #[allow(dead_code)]
    pub(crate) key_id: String,
    pub(crate) opaque_handle: String,
    pub(crate) value: Vec<u8>,
}

impl Drop for SelectedKey {
    fn drop(&mut self) {
        self.value.zeroize();
    }
}

/// The key ring: selection + CRUD + health/cooldown/budget state, all on the
/// vault's SQLCipher connection. Cheap to construct; the broker holds one.
pub struct KeyRing<'a> {
    conn: &'a Connection,
    /// Round-robin cursor per provider.
    rr_cursor: Mutex<HashMap<String, usize>>,
    /// Affinity: (provider, model, session) → opaque handle.
    affinity: Mutex<HashMap<(String, String, String), String>>,
}

impl<'a> KeyRing<'a> {
    pub fn new(vault: &'a Vault) -> Self {
        Self {
            conn: vault.connection(),
            rr_cursor: Mutex::new(HashMap::new()),
            affinity: Mutex::new(HashMap::new()),
        }
    }

    // ---- CRUD -----------------------------------------------------------

    /// Add a key to the ring. Returns the fresh opaque handle.
    pub fn add_key(&self, spec: KeySpec) -> Result<String, KeyRingError> {
        let handle = mint_handle();
        self.conn.execute(
            "INSERT OR REPLACE INTO key_ring
                (provider, key_id, opaque_handle, value, status, model_filter, priority,
                 daily_token_cap, daily_cost_cap)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                spec.provider,
                spec.key_id,
                handle,
                spec.value,
                spec.status.as_str(),
                join_filter(&spec.model_filter),
                spec.priority as i64,
                spec.daily_token_cap.map(|c| c as i64),
                spec.daily_cost_cap,
            ],
        )?;
        Ok(handle)
    }

    /// Remove a key (revokes its handle). Also drops any session affinity
    /// pointing at it.
    pub fn delete_key(&self, provider: &str, key_id: &str) -> Result<(), KeyRingError> {
        // Capture the handle before deleting so affinity entries pointing at
        // this key can be dropped (delete_key has no idempotent re-fetch).
        let handle = match self.get(provider, key_id) {
            Ok(entry) => entry.opaque_handle.clone(),
            Err(KeyRingError::NotFound(_, _)) => {
                return Err(KeyRingError::NotFound(provider.into(), key_id.into()));
            }
            Err(e) => return Err(e),
        };
        self.conn.execute(
            "DELETE FROM key_ring WHERE provider = ?1 AND key_id = ?2",
            rusqlite::params![provider, key_id],
        )?;
        self.affinity
            .lock()
            .expect("affinity poisoned")
            .retain(|_, h| h != &handle);
        Ok(())
    }

    /// Replace a key's secret and mint a NEW opaque handle (rotation revokes
    /// the old handle per doc 53 §2).
    pub fn rotate_key(
        &self,
        provider: &str,
        key_id: &str,
        new_value: &[u8],
    ) -> Result<String, KeyRingError> {
        let new_handle = mint_handle();
        let n = self.conn.execute(
            "UPDATE key_ring SET value = ?3, opaque_handle = ?4, fail_count = 0,
                    cooldown_until = 0
             WHERE provider = ?1 AND key_id = ?2",
            rusqlite::params![provider, key_id, new_value, new_handle],
        )?;
        if n == 0 {
            return Err(KeyRingError::NotFound(provider.into(), key_id.into()));
        }
        Ok(new_handle)
    }

    /// Change a key's status tier.
    pub fn set_status(
        &self,
        provider: &str,
        key_id: &str,
        status: KeyStatus,
    ) -> Result<(), KeyRingError> {
        self.patch(provider, key_id, |row| row.set_status(status))
    }

    /// Restrict a key to a model list (empty = any).
    pub fn set_model_filter(
        &self,
        provider: &str,
        key_id: &str,
        models: &[String],
    ) -> Result<(), KeyRingError> {
        let models = models.to_vec();
        self.patch(provider, key_id, move |row| row.set_filter(models))
    }

    /// Change a key's priority (lower = higher).
    pub fn set_priority(
        &self,
        provider: &str,
        key_id: &str,
        priority: u32,
    ) -> Result<(), KeyRingError> {
        self.patch(provider, key_id, move |row| row.set_priority(priority))
    }

    /// Set daily budget caps (None = unlimited).
    pub fn set_caps(
        &self,
        provider: &str,
        key_id: &str,
        token_cap: Option<u64>,
        cost_cap: Option<f64>,
    ) -> Result<(), KeyRingError> {
        self.patch(provider, key_id, move |row| {
            row.set_caps(token_cap, cost_cap)
        })
    }

    /// Look up one key by provider + label.
    pub fn get(&self, provider: &str, key_id: &str) -> Result<KeyEntry, KeyRingError> {
        let mut stmt = self.conn.prepare(KEY_GET_SQL).map_err(KeyRingError::from)?;
        stmt.query_row(rusqlite::params![provider, key_id], row_to_entry)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    KeyRingError::NotFound(provider.into(), key_id.into())
                }
                other => KeyRingError::Sqlite(other),
            })
    }

    /// List keys for a provider — handle-only views, never the secret.
    pub fn list(&self, provider: &str) -> Result<Vec<KeyInfo>, KeyRingError> {
        let now = now_ms();
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, provider, key_id, opaque_handle, status, model_filter, priority,
                        tokens_day, cost_day, daily_token_cap, daily_cost_cap,
                        fail_count, success_count, last_used_at, cooldown_until
                 FROM key_ring WHERE provider = ?1 ORDER BY priority, id",
            )
            .map_err(KeyRingError::from)?;
        let rows = stmt
            .query_map([provider], |r| {
                let e = row_to_info(r, now)?;
                Ok(e)
            })
            .map_err(KeyRingError::from)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    // ---- Selection ------------------------------------------------------

    /// Select a key for `(provider, model, session)` under `policy`.
    ///
    /// Returns an error when nothing eligible remains — the broker turns that
    /// into the aggregated "all keys exhausted" surface (P1.1).
    pub fn select(
        &self,
        provider: &str,
        model: &str,
        session_id: &str,
        policy: RoutingPolicy,
    ) -> Result<SelectedKey, KeyRingError> {
        let now = now_ms();
        let mut stmt = self
            .conn
            .prepare(KEY_SELECT_SQL)
            .map_err(KeyRingError::from)?;
        let rows = stmt
            .query_map([provider], row_to_entry)
            .map_err(KeyRingError::from)?;
        let mut keys: Vec<KeyEntry> = Vec::new();
        for r in rows {
            keys.push(r?);
        }
        if keys.is_empty() {
            return Err(KeyRingError::NoKeys(provider.into()));
        }

        // Daily budget rollover: a key untouched since yesterday has a fresh
        // budget even before its first use today.
        for k in &mut keys {
            if !is_today(k.last_used_at) {
                k.tokens_day = 0;
                k.cost_day = 0.0;
            }
        }

        let eligible = |k: &KeyEntry, allow_backup: bool| -> bool {
            if k.status == KeyStatus::Suspended {
                return false;
            }
            if !allow_backup && k.status == KeyStatus::Backup {
                return false;
            }
            if !k.model_filter.is_empty() && !k.model_filter.iter().any(|m| m == model) {
                return false;
            }
            if k.cooldown_until > now {
                return false;
            }
            if let Some(cap) = k.daily_token_cap {
                if k.tokens_day >= cap {
                    return false;
                }
            }
            if let Some(cap) = k.daily_cost_cap {
                if k.cost_day >= cap {
                    return false;
                }
            }
            true
        };

        // Tier 1: primary + standby. Tier 2 (last resort): + backup. The
        // originals in `keys` drop (and zeroize their secrets) at scope end.
        let mut pool: Vec<KeyEntry> = keys
            .iter()
            .filter(|k| eligible(k, false))
            .cloned()
            .collect();
        if pool.is_empty() {
            pool = keys.iter().filter(|k| eligible(k, true)).cloned().collect();
        }
        if pool.is_empty() {
            return Err(KeyRingError::AllKeysExhausted(provider.into()));
        }

        // Affinity: same (provider, model, session) → same key. When the pin
        // hits, the pinned key wins over ANY policy rotation (round-robin
        // cursor must not rotate away from a pinned session).
        let mut affinity_hit = false;
        if !session_id.is_empty() {
            let handle = self
                .affinity
                .lock()
                .expect("affinity poisoned")
                .get(&(
                    provider.to_string(),
                    model.to_string(),
                    session_id.to_string(),
                ))
                .cloned();
            if let Some(handle) = handle {
                if let Some(pos) = pool.iter().position(|k| k.opaque_handle == handle) {
                    let preferred = pool.remove(pos);
                    pool.insert(0, preferred);
                    affinity_hit = true;
                }
            }
        }

        if !affinity_hit {
            // Policy ordering (skipped for pinned sessions).
            match policy {
                RoutingPolicy::Priority => pool.sort_by_key(|k| k.priority),
                RoutingPolicy::LeastUsed => pool.sort_by_key(|k| (k.tokens_day, k.priority)),
                RoutingPolicy::RoundRobin => {
                    let mut cursor = self.rr_cursor.lock().expect("rr poisoned");
                    let c = cursor.entry(provider.to_string()).or_insert(0);
                    let pick = *c % pool.len();
                    *c = (*c + 1) % pool.len().max(1);
                    let head = pool.remove(pick);
                    pool.insert(0, head);
                }
            }
        }

        let pick = pool.remove(0);
        let selected = SelectedKey {
            provider: pick.provider.clone(),
            key_id: pick.key_id.clone(),
            opaque_handle: pick.opaque_handle.clone(),
            value: pick.value.clone(),
        };
        // Persist the affinity pin so later calls in the same session reuse
        // the same key.
        if !session_id.is_empty() {
            self.affinity.lock().expect("affinity poisoned").insert(
                (
                    provider.to_string(),
                    model.to_string(),
                    session_id.to_string(),
                ),
                pick.opaque_handle.clone(),
            );
        }
        Ok(selected)
    }

    // ---- Health / cooldown / budget reports -----------------------------

    /// Record a successful call: bumps success count, resets failures, stamps
    /// last-used.
    pub fn report_success(&self, handle: &str) -> Result<(), KeyRingError> {
        self.conn.execute(
            "UPDATE key_ring SET success_count = success_count + 1, fail_count = 0,
                    last_used_at = ?2
             WHERE opaque_handle = ?1",
            rusqlite::params![handle, now_ms()],
        )?;
        Ok(())
    }

    /// Record a failure. A 429 puts the key into cooldown with exponential
    /// backoff: `base × 2^failures` seconds, capped at 5 minutes.
    pub fn report_failure(&self, handle: &str, is_rate_limited: bool) -> Result<(), KeyRingError> {
        if !is_rate_limited {
            self.conn.execute(
                "UPDATE key_ring SET fail_count = fail_count + 1, last_used_at = ?2
                 WHERE opaque_handle = ?1",
                rusqlite::params![handle, now_ms()],
            )?;
            return Ok(());
        }
        let failures: u64 = self
            .conn
            .query_row(
                "SELECT fail_count FROM key_ring WHERE opaque_handle = ?1",
                [handle],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(0);
        // New failure count after this 429.
        let new_failures = failures.saturating_add(1);
        let backoff = compute_backoff_secs(new_failures);
        let cooldown_until = now_ms() + (backoff * 1000) as i64;
        self.conn.execute(
            "UPDATE key_ring SET fail_count = ?2, cooldown_until = ?3, last_used_at = ?4
             WHERE opaque_handle = ?1",
            rusqlite::params![handle, new_failures as i64, cooldown_until, now_ms()],
        )?;
        Ok(())
    }

    /// Record token/cost usage. Daily counters roll over lazily on first use
    /// of a new day.
    pub fn report_usage(&self, handle: &str, tokens: u64, cost: f64) -> Result<(), KeyRingError> {
        let row: Option<(i64, u64, f64)> = self
            .conn
            .query_row(
                "SELECT last_used_at, tokens_day, cost_day FROM key_ring WHERE opaque_handle = ?1",
                [handle],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let Some((last_used, tokens_day, cost_day)) = row else {
            return Err(KeyRingError::HandleUnknown(handle.into()));
        };
        let (tokens_day, cost_day) = if is_today(last_used) {
            (tokens_day, cost_day)
        } else {
            (0, 0.0)
        };
        self.conn.execute(
            "UPDATE key_ring SET tokens_day = ?2, cost_day = ?3, last_used_at = ?4
             WHERE opaque_handle = ?1",
            rusqlite::params![
                handle,
                (tokens_day + tokens) as i64,
                cost_day + cost,
                now_ms()
            ],
        )?;
        Ok(())
    }

    /// Current 429 backoff for a given consecutive-failure count (P1.1):
    /// `base × 2^(failures-1)` capped at [`COOLDOWN_CAP_SECS`].
    pub fn backoff_secs(failures: u64) -> u64 {
        compute_backoff_secs(failures)
    }

    // ---- internal -------------------------------------------------------

    fn patch(
        &self,
        provider: &str,
        key_id: &str,
        f: impl FnOnce(&mut KeyEntry),
    ) -> Result<(), KeyRingError> {
        let mut entry = self.get(provider, key_id)?;
        f(&mut entry);
        self.conn.execute(
            "UPDATE key_ring SET status = ?3, model_filter = ?4, priority = ?5,
                    daily_token_cap = ?6, daily_cost_cap = ?7
             WHERE provider = ?1 AND key_id = ?2",
            rusqlite::params![
                provider,
                key_id,
                entry.status.as_str(),
                join_filter(&entry.model_filter),
                entry.priority as i64,
                entry.daily_token_cap.map(|c| c as i64),
                entry.daily_cost_cap,
            ],
        )?;
        Ok(())
    }
}

const KEY_SELECT_SQL: &str = "SELECT id, provider, key_id, opaque_handle, value, status,
        model_filter, priority, tokens_day, cost_day, daily_token_cap, daily_cost_cap,
        fail_count, success_count, last_used_at, cooldown_until
 FROM key_ring WHERE provider = ?1";

const KEY_GET_SQL: &str = "SELECT id, provider, key_id, opaque_handle, value, status,
        model_filter, priority, tokens_day, cost_day, daily_token_cap, daily_cost_cap,
        fail_count, success_count, last_used_at, cooldown_until
 FROM key_ring WHERE provider = ?1 AND key_id = ?2";

fn row_to_entry(r: &Row<'_>) -> rusqlite::Result<KeyEntry> {
    Ok(KeyEntry {
        id: r.get(0)?,
        provider: r.get(1)?,
        key_id: r.get(2)?,
        opaque_handle: r.get(3)?,
        value: r.get(4)?,
        status: KeyStatus::parse(&r.get::<_, String>(5)?).unwrap_or(KeyStatus::Suspended),
        model_filter: split_filter(&r.get::<_, String>(6)?),
        priority: r.get::<_, i64>(7)? as u32,
        tokens_day: r.get::<_, i64>(8)? as u64,
        cost_day: r.get(9)?,
        daily_token_cap: r.get::<_, Option<i64>>(10)?.map(|c| c as u64),
        daily_cost_cap: r.get(11)?,
        fail_count: r.get::<_, i64>(12)? as u64,
        success_count: r.get::<_, i64>(13)? as u64,
        last_used_at: r.get(14)?,
        cooldown_until: r.get(15)?,
    })
}

fn row_to_info(r: &Row<'_>, now: i64) -> rusqlite::Result<KeyInfo> {
    let cooldown_until: i64 = r.get(14)?;
    Ok(KeyInfo {
        provider: r.get(1)?,
        key_id: r.get(2)?,
        opaque_handle: r.get(3)?,
        status: r.get(4)?,
        model_filter: split_filter(&r.get::<_, String>(5)?),
        priority: r.get::<_, i64>(6)? as u32,
        tokens_day: r.get::<_, i64>(7)? as u64,
        cost_day: r.get(8)?,
        daily_token_cap: r.get::<_, Option<i64>>(9)?.map(|c| c as u64),
        daily_cost_cap: r.get(10)?,
        fail_count: r.get::<_, i64>(11)? as u64,
        success_count: r.get::<_, i64>(12)? as u64,
        last_used_at: r.get(13)?,
        cooldown_until,
        in_cooldown: cooldown_until > now,
    })
}

fn compute_backoff_secs(failures: u64) -> u64 {
    // base × 2^(failures-1), capped
    let exp = failures.saturating_sub(1);
    let doubled = COOLDOWN_BASE_SECS.saturating_mul(1u64 << exp.min(16));
    doubled.min(COOLDOWN_CAP_SECS)
}

impl KeyEntry {
    fn set_status(&mut self, status: KeyStatus) {
        self.status = status;
    }

    fn set_filter(&mut self, models: Vec<String>) {
        self.model_filter = models;
    }

    fn set_priority(&mut self, priority: u32) {
        self.priority = priority;
    }

    fn set_caps(&mut self, token_cap: Option<u64>, cost_cap: Option<f64>) {
        self.daily_token_cap = token_cap;
        self.daily_cost_cap = cost_cap;
    }
}

fn join_filter(models: &[String]) -> String {
    models.join(",")
}

fn split_filter(s: &str) -> Vec<String> {
    s.split(',')
        .map(str::trim)
        .filter(|m| !m.is_empty())
        .map(str::to_string)
        .collect()
}

/// Fresh 128-bit opaque handle (32 hex chars).
fn mint_handle() -> String {
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut hex = String::with_capacity(32);
    for b in bytes {
        hex.push_str(&format!("{b:02x}"));
    }
    bytes.zeroize();
    hex
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn is_today(ms: i64) -> bool {
    const DAY: i64 = 86_400_000;
    let today = now_ms() / DAY;
    ms / DAY == today
}

#[derive(Debug, thiserror::Error)]
pub enum KeyRingError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("key not found: {0}/{1}")]
    NotFound(String, String),
    #[error("provider '{0}' has no keys in the ring")]
    NoKeys(String),
    #[error("all keys for provider '{0}' are exhausted (suspended/cooldown/budget)")]
    AllKeysExhausted(String),
    #[error("unknown opaque handle: {0}")]
    HandleUnknown(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Vault;

    fn ring() -> KeyRing<'static> {
        // In-memory vault, leaked for 'static (tests only).
        let vault: &'static Vault = Box::leak(Box::new(Vault::open_in_memory("test-key").unwrap()));
        KeyRing::new(vault)
    }

    fn spec(provider: &str, key_id: &str, value: &str) -> KeySpec {
        KeySpec {
            provider: provider.into(),
            key_id: key_id.into(),
            value: value.as_bytes().to_vec(),
            status: KeyStatus::Primary,
            model_filter: vec![],
            priority: 100,
            daily_token_cap: None,
            daily_cost_cap: None,
        }
    }

    #[test]
    fn add_list_delete_roundtrip() {
        let ring = ring();
        let h1 = ring.add_key(spec("openai", "prod-1", "sk-one")).unwrap();
        let h2 = ring.add_key(spec("openai", "prod-2", "sk-two")).unwrap();
        assert_ne!(h1, h2);
        assert_eq!(h1.len(), 32); // 128-bit hex

        let list = ring.list("openai").unwrap();
        assert_eq!(list.len(), 2);
        // Sealed channel: KeyInfo must never serialize a secret.
        let json = serde_json::to_string(&list[0]).unwrap();
        assert!(!json.contains("sk-one"));
        assert!(!json.to_lowercase().contains("value"));

        ring.delete_key("openai", "prod-1").unwrap();
        assert_eq!(ring.list("openai").unwrap().len(), 1);
        assert!(matches!(
            ring.get("openai", "prod-1"),
            Err(KeyRingError::NotFound(_, _))
        ));
    }

    #[test]
    fn rotation_mints_new_handle() {
        let ring = ring();
        let h1 = ring.add_key(spec("nvidia", "nim", "old-secret")).unwrap();
        let h2 = ring.rotate_key("nvidia", "nim", b"new-secret").unwrap();
        assert_ne!(h1, h2);
        let entry = ring.get("nvidia", "nim").unwrap();
        assert_eq!(entry.value, b"new-secret");
        assert_eq!(entry.opaque_handle, h2);
    }

    #[test]
    fn status_tiers_gate_selection() {
        let ring = ring();
        ring.add_key(spec("p", "primary", "a")).unwrap();
        ring.add_key(KeySpec {
            status: KeyStatus::Suspended,
            ..spec("p", "suspended", "b")
        })
        .unwrap();
        let k = ring.select("p", "m", "", RoutingPolicy::Priority).unwrap();
        assert_eq!(k.key_id, "primary");
    }

    #[test]
    fn backup_only_used_when_primaries_exhausted() {
        let ring = ring();
        // Both primaries are in cooldown; only the backup is eligible.
        ring.add_key(spec("p", "primary-1", "a")).unwrap();
        ring.add_key(spec("p", "primary-2", "b")).unwrap();
        ring.add_key(KeySpec {
            status: KeyStatus::Backup,
            ..spec("p", "backup-1", "c")
        })
        .unwrap();
        // Put primaries in cooldown.
        for h in ring.list("p").unwrap() {
            if h.key_id != "backup-1" {
                ring.report_failure(&h.opaque_handle, true).unwrap();
            }
        }
        let k = ring.select("p", "m", "", RoutingPolicy::Priority).unwrap();
        assert_eq!(k.key_id, "backup-1");
    }

    #[test]
    fn priority_policy_picks_lowest_number() {
        let ring = ring();
        ring.add_key(KeySpec {
            priority: 200,
            key_id: "low-prio".into(),
            ..spec("p", "low-prio", "a")
        })
        .unwrap();
        ring.add_key(KeySpec {
            priority: 10,
            key_id: "high-prio".into(),
            ..spec("p", "high-prio", "b")
        })
        .unwrap();
        let k = ring.select("p", "m", "", RoutingPolicy::Priority).unwrap();
        assert_eq!(k.key_id, "high-prio");
    }

    #[test]
    fn round_robin_rotates() {
        let ring = ring();
        ring.add_key(spec("p", "k1", "a")).unwrap();
        ring.add_key(spec("p", "k2", "b")).unwrap();
        ring.add_key(spec("p", "k3", "c")).unwrap();
        let a = ring
            .select("p", "m", "", RoutingPolicy::RoundRobin)
            .unwrap();
        let b = ring
            .select("p", "m", "", RoutingPolicy::RoundRobin)
            .unwrap();
        let c = ring
            .select("p", "m", "", RoutingPolicy::RoundRobin)
            .unwrap();
        let d = ring
            .select("p", "m", "", RoutingPolicy::RoundRobin)
            .unwrap();
        assert_eq!(a.key_id, "k1");
        assert_eq!(b.key_id, "k2");
        assert_eq!(c.key_id, "k3");
        assert_eq!(d.key_id, "k1");
    }

    #[test]
    fn least_used_picks_min_tokens() {
        let ring = ring();
        ring.add_key(spec("p", "heavy", "a")).unwrap();
        ring.add_key(spec("p", "light", "b")).unwrap();
        // Burn tokens on `heavy`.
        let h = ring.list("p").unwrap();
        let heavy = h.iter().find(|i| i.key_id == "heavy").unwrap();
        ring.report_usage(&heavy.opaque_handle, 10_000, 0.0)
            .unwrap();
        let k = ring.select("p", "m", "", RoutingPolicy::LeastUsed).unwrap();
        assert_eq!(k.key_id, "light");
    }

    #[test]
    fn model_filter_restricts_keys() {
        let ring = ring();
        ring.add_key(KeySpec {
            model_filter: vec!["gpt-4o".into()],
            key_id: "gpt-only".into(),
            ..spec("p", "gpt-only", "a")
        })
        .unwrap();
        ring.add_key(spec("p", "any", "b")).unwrap();
        // `gpt-4o` matches the filtered key; `claude` must skip it.
        let k = ring
            .select("p", "gpt-4o", "", RoutingPolicy::Priority)
            .unwrap();
        assert_eq!(k.key_id, "gpt-only");
        let k = ring
            .select("p", "claude-3", "", RoutingPolicy::Priority)
            .unwrap();
        assert_eq!(k.key_id, "any");
    }

    #[test]
    fn cooldown_backoff_doubles_and_caps() {
        let ring = ring();
        ring.add_key(spec("p", "k", "a")).unwrap();
        let handle = ring.list("p").unwrap()[0].opaque_handle.clone();

        ring.report_failure(&handle, true).unwrap();
        let first = ring.get("p", "k").unwrap().cooldown_until;
        // base × 2^0 = 5s (tolerant of sub-ms clock drift).
        assert!((first - now_ms() - 5000).abs() <= 2);

        ring.report_failure(&handle, true).unwrap();
        let second = ring.get("p", "k").unwrap().cooldown_until;
        // base × 2^1 = 10s → delta 5s (cooldown_until is computed once per
        // call, so this delta is exact).
        assert_eq!(second - first, 5000);

        // 7 failures: 5 × 2^6 = 320s → capped at 300s (5 min).
        for _ in 0..5 {
            ring.report_failure(&handle, true).unwrap();
        }
        let capped = ring.get("p", "k").unwrap().cooldown_until;
        assert!((capped - now_ms() - 300_000).abs() <= 2);
    }

    #[test]
    fn key_in_cooldown_is_skipped() {
        let ring = ring();
        ring.add_key(spec("p", "hot", "a")).unwrap();
        ring.add_key(spec("p", "cold", "b")).unwrap();
        let handle = ring.list("p").unwrap();
        let hot = handle.iter().find(|i| i.key_id == "hot").unwrap();
        ring.report_failure(&hot.opaque_handle, true).unwrap();
        // `hot` in cooldown → `cold` selected (even though `hot` has priority).
        let k = ring.select("p", "m", "", RoutingPolicy::Priority).unwrap();
        assert_eq!(k.key_id, "cold");
    }

    #[test]
    fn budget_cap_blocks_selection_and_rolls_over() {
        let ring = ring();
        ring.add_key(KeySpec {
            daily_token_cap: Some(1_000),
            key_id: "capped".into(),
            ..spec("p", "capped", "a")
        })
        .unwrap();
        ring.add_key(spec("p", "uncapped", "b")).unwrap();
        let handle = ring.list("p").unwrap();
        let capped = handle.iter().find(|i| i.key_id == "capped").unwrap();
        ring.report_usage(&capped.opaque_handle, 1_000, 0.0)
            .unwrap();
        // At cap → uncapped wins.
        let k = ring.select("p", "m", "", RoutingPolicy::Priority).unwrap();
        assert_eq!(k.key_id, "uncapped");
        // Lazy rollover: force last_used_at into yesterday.
        ring.conn
            .execute(
                "UPDATE key_ring SET last_used_at = last_used_at - 86400000 WHERE key_id='capped'",
                [],
            )
            .unwrap();
        let k = ring.select("p", "m", "", RoutingPolicy::Priority).unwrap();
        assert_eq!(k.key_id, "capped");
    }

    #[test]
    fn affinity_pins_session_to_same_key() {
        let ring = ring();
        ring.add_key(spec("p", "k1", "a")).unwrap();
        ring.add_key(spec("p", "k2", "b")).unwrap();
        // Round-robin would alternate, but affinity pins within a session.
        let a = ring
            .select("p", "m", "session-7", RoutingPolicy::RoundRobin)
            .unwrap();
        let b = ring
            .select("p", "m", "session-7", RoutingPolicy::RoundRobin)
            .unwrap();
        assert_eq!(a.opaque_handle, b.opaque_handle);
        // A different session is free to rotate.
        let c = ring
            .select("p", "m", "session-8", RoutingPolicy::RoundRobin)
            .unwrap();
        assert_ne!(a.opaque_handle, c.opaque_handle);
    }

    #[test]
    fn health_tracking_updates_counters() {
        let ring = ring();
        ring.add_key(spec("p", "k", "a")).unwrap();
        let handle = ring.list("p").unwrap()[0].opaque_handle.clone();
        ring.report_failure(&handle, false).unwrap();
        let e = ring.get("p", "k").unwrap();
        assert_eq!(e.fail_count, 1);
        assert_eq!(e.success_count, 0);
        ring.report_success(&handle).unwrap();
        let e = ring.get("p", "k").unwrap();
        assert_eq!(e.success_count, 1);
        assert_eq!(e.fail_count, 0);
        assert!(e.last_used_at > 0);
    }

    #[test]
    fn no_keys_errors() {
        let ring = ring();
        assert!(matches!(
            ring.select("empty", "m", "", RoutingPolicy::Priority),
            Err(KeyRingError::NoKeys(_))
        ));
    }

    #[test]
    fn secret_buffers_are_zeroized_on_drop() {
        // The zeroize crate guarantee (what Drop relies on) — direct check.
        let mut buf = b"super-secret".to_vec();
        buf.zeroize();
        assert!(buf.iter().all(|b| *b == 0));

        // SelectedKey/KeyEntry Drop paths must not panic and must scrub their
        // internal buffers (covered by construction: Drop calls zeroize).
        let ring = ring();
        ring.add_key(spec("p", "k", "super-secret")).unwrap();
        let key = ring.select("p", "m", "", RoutingPolicy::Priority).unwrap();
        assert_eq!(key.value, b"super-secret");
        drop(key);
        let entry = ring.get("p", "k").unwrap();
        drop(entry);
    }

    #[test]
    fn keyinfo_sealed_channel_no_value_field() {
        let ring = ring();
        ring.add_key(spec("p", "k", "hidden")).unwrap();
        let info = ring.list("p").unwrap();
        let json = serde_json::to_string(&info[0]).unwrap();
        assert!(!json.contains("hidden"));
        assert!(!json.contains("\"value\""));
        assert!(json.contains("opaqueHandle"));
    }
}
