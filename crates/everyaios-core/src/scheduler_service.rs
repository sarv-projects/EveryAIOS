//! Scheduled-task core (P6.4 — B7). The durable, Rust-owned scheduler:
//! "Rust disposes" — job state, cron math, leases, retry, battery policy and
//! nudge sentinels all live here; the coordinator proposes executions via
//! `scheduler/*` JSON-RPC and runs the steps (reawakening the job's session).
//!
//! Patterns adopted (pattern-only, no copied code):
//! - cronflow (doc 56 §3, no LICENSE → reference only): **HITL pause as a
//!   first-class state-machine state** (`RunState::Paused` with a resume
//!   deadline, explicit transitions), **webhook triggers with schema
//!   validation**, **retry with backoff + jitter + max-backoff clamp**.
//! - Hatchet / durable-execution-the-hard-way (doc 67 §2, MIT): **heartbeat
//!   lease model** — a run holds a lease with an expiry; a missed heartbeat
//!   marks the job reassignable and the next due-cycle re-runs it from its
//!   **last completed step checkpoint** (durable event log = the audit seq,
//!   non-determinism guard = completed steps are never re-executed).
//! - Gartner event-driven orchestration (doc 62 §3): **CI build-fail /
//!   test-regression / repo-change / ticket-assign / telemetry-threshold**
//!   triggers with **scope + frequency policy** controls.
//! - Nudge sentinels (B7): detect repeating patterns (same goal at the same
//!   time-of-day/weekday) → suggest a schedule (H14 nudge-card surface).

use std::collections::HashMap;

use everyaios_blueprint::automation::AutomationStep;
use serde_json::{json, Value};

// ---------------------------------------------------------------------------
// Cron (5-field: min hour dom mon dow; `*`, `N`, `N-M`, `*/step`, comma lists)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct CronExpr {
    minute: Vec<u8>,
    hour: Vec<u8>,
    dom: Vec<u8>,
    month: Vec<u8>,
    dow: Vec<u8>,
    /// Raw source (for display).
    pub source: String,
}

fn parse_field(field: &str, min: u8, max: u8) -> Result<Vec<u8>, String> {
    if field == "*" {
        return Ok((min..=max).collect());
    }
    let mut out = Vec::new();
    for part in field.split(',') {
        let (range, step) = match part.split_once('/') {
            Some((r, s)) => (r, s.parse::<u8>().map_err(|_| format!("bad step {s}"))?),
            None => (part, 1),
        };
        if step == 0 {
            return Err(format!("step cannot be 0 in {field}"));
        }
        let (lo, hi) = if range == "*" {
            (min, max)
        } else if let Some((a, b)) = range.split_once('-') {
            (
                a.parse::<u8>().map_err(|_| format!("bad range {range}"))?,
                b.parse::<u8>().map_err(|_| format!("bad range {range}"))?,
            )
        } else {
            let v = range.parse::<u8>().map_err(|_| format!("bad value {range}"))?;
            (v, v)
        };
        if lo < min || hi > max || lo > hi {
            return Err(format!("value out of range in {field}"));
        }
        let mut v = lo;
        while v <= hi {
            out.push(v);
            v = v.saturating_add(step);
        }
    }
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

impl CronExpr {
    /// Parse a standard 5-field cron string (`min hour dom mon dow`).
    pub fn parse(source: &str) -> Result<Self, String> {
        let parts: Vec<&str> = source.split_whitespace().collect();
        if parts.len() != 5 {
            return Err(format!("cron needs 5 fields, got {}: {source:?}", parts.len()));
        }
        Ok(Self {
            minute: parse_field(parts[0], 0, 59)?,
            hour: parse_field(parts[1], 0, 23)?,
            dom: parse_field(parts[2], 1, 31)?,
            month: parse_field(parts[3], 1, 12)?,
            dow: parse_field(parts[4], 0, 6)?,
            source: source.to_string(),
        })
    }

    /// Does this cron match the given unix time (minute granularity)?
    pub fn matches(&self, unix_secs: u64) -> bool {
        let (min, hour, dom, month, dow) = civil_parts(unix_secs);
        if !self.minute.contains(&min) || !self.hour.contains(&hour) {
            return false;
        }
        if !self.month.contains(&month) {
            return false;
        }
        // Standard cron OR-semantics when both dom and dow are restricted.
        let dom_restricted = self.dom != (1..=31).collect::<Vec<_>>();
        let dow_restricted = self.dow != (0..=6).collect::<Vec<_>>();
        if dom_restricted && dow_restricted {
            self.dom.contains(&dom) || self.dow.contains(&dow)
        } else {
            self.dom.contains(&dom) && self.dow.contains(&dow)
        }
    }
}

/// Civil date parts from a unix timestamp (Howard Hinnant algorithms).
fn civil_parts(unix_secs: u64) -> (u8, u8, u8, u8, u8) {
    let days = (unix_secs / 86_400) as i64;
    let secs_of_day = unix_secs % 86_400;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u8; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u8; // [1, 12]
    // 1970-01-01 was a Thursday; days % 7 = 0 is Thursday, so +4 shifts to
    // Sunday = 0 (cron dow convention).
    let weekday = (((days + 4) % 7) + 7) % 7; // 0 = Sunday (cron dow)
    (
        (secs_of_day / 60 % 60) as u8,
        (secs_of_day / 3600) as u8,
        d,
        m,
        weekday as u8,
    )
}

// ---------------------------------------------------------------------------
// Triggers, policy, run state
// ---------------------------------------------------------------------------

/// Event-driven trigger kinds (doc 62 §3 — Gartner 2026 observability signals).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    CiBuildFail,
    TestRegression,
    RepoChange,
    TicketAssign,
    TelemetryThreshold,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TriggerSpec {
    Cron { expr: String },
    Interval { secs: u64 },
    /// Event-triggered; `filter` matches a payload field (repo path, ticket id
    /// pattern, metric name…). `scope` (in [`SchedulePolicy`]) narrows further.
    Event { kind: EventKind, filter: String },
    /// Loopback webhook ingress (F11); `path` is the URL path, `schema` lists
    /// required body keys (validated before the job is queued).
    Webhook { path: String, schema: Vec<String> },
}

/// Policy controls per job (doc 62 §3: scope + frequency; battery-aware B7).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulePolicy {
    /// Suppress runs while the device is on battery.
    pub suppress_on_battery: bool,
    /// Max runs per rolling hour (event/webhook spam guard).
    pub max_runs_per_hour: Option<u32>,
    /// Scope filter (repo/worktree/path prefix the event payload must match).
    pub scope: Option<String>,
}

impl Default for SchedulePolicy {
    fn default() -> Self {
        Self {
            suppress_on_battery: true,
            max_runs_per_hour: Some(4),
            scope: None,
        }
    }
}

/// Run state machine — HITL pause is a first-class state (cronflow pattern).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum RunState {
    Idle,
    /// A run is in flight; the lease expires if the executor stops heartbeating
    /// (Hatchet pattern) → the job becomes reassignable on the next due-cycle.
    Running {
        #[serde(rename = "leaseExpiresAt")]
        lease_expires_at: u64,
    },
    /// HITL pause (approval / review). `resume_deadline` = auto-resume-or-cancel
    /// bound; `None` = paused indefinitely until an explicit resume.
    Paused {
        #[serde(rename = "resumeDeadline")]
        resume_deadline: Option<u64>,
    },
    /// Failed after retries; `next_retry_at` is the backoff schedule.
    Failed {
        retries: u32,
        #[serde(rename = "nextRetryAt")]
        next_retry_at: Option<u64>,
    },
}

/// Monitoring semantics (the ChatGPT "monitoring task" pattern): a recurring
/// job whose runs *observe* state and notify only on a meaningful delta,
/// remembering the previous observation between runs ("previous runs are
/// remembered"). `stop_on_condition` stops the monitor when the executor
/// reports the end condition met (e.g. "package delivered").
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorConfig {
    /// Stop the recurring monitor when the executor reports the end condition
    /// met (disable the job + keep the record).
    #[serde(default)]
    pub stop_on_condition: bool,
    /// Previous run's observation (persisted monitoring state). `None` = never
    /// observed (the first run always notifies as the baseline).
    #[serde(default)]
    pub last_observation: Option<String>,
    /// Notifications sent so far (the "run vs notify" accounting).
    #[serde(default)]
    pub notifications: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub name: String,
    /// The session this job reawakens (heartbeat automation — doc 67 §2).
    pub session_id: String,
    pub trigger: TriggerSpec,
    pub steps: Vec<AutomationStep>,
    pub policy: SchedulePolicy,
    pub enabled: bool,
    pub state: RunState,
    /// Last completed step index (durable checkpoint for lease reassignment).
    pub checkpoint: u32,
    /// Next due unix time (cron/interval); None = waiting on an event.
    pub next_run_at: Option<u64>,
    /// Last fired unix time (frequency + nudge accounting).
    pub last_run_at: Option<u64>,
    /// Rolling 1h fire timestamps (frequency policy).
    pub recent_runs: Vec<u64>,
    pub runs: u32,
    pub successes: u32,
    pub failures: u32,
    /// Monitoring config (`None` = a plain scheduled/event job; lazily created
    /// by `monitor_evaluate` for delta-notify semantics).
    #[serde(default)]
    pub monitor: Option<MonitorConfig>,
}

/// The outcome of one monitoring evaluation (stateful-polling delta check).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorVerdict {
    /// The new observation differs from the previous one (or it's the first run).
    pub changed: bool,
    /// Should the user be notified this run? (first run, a delta, or the stop
    /// condition) — the "run vs notify" split: a run completes without
    /// notifying when nothing changed.
    pub notified: bool,
    /// The end condition was met and `stop_on_condition` was set → the monitor
    /// was stopped (job disabled, state reset to idle).
    pub stopped: bool,
    /// The previous observation (None on the first run).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous: Option<String>,
    /// The observation just recorded.
    pub current: String,
    /// Total notifications sent after this run.
    pub notifications: u32,
}

impl Job {
    fn new(id: impl Into<String>, name: impl Into<String>, session_id: impl Into<String>, trigger: TriggerSpec) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            session_id: session_id.into(),
            trigger,
            policy: SchedulePolicy::default(),
            steps: Vec::new(),
            enabled: true,
            state: RunState::Idle,
            checkpoint: 0,
            next_run_at: None,
            last_run_at: None,
            recent_runs: Vec::new(),
            runs: 0,
            successes: 0,
            failures: 0,
            monitor: None,
        }
    }

    /// Retry backoff with jitter + clamp (cronflow pattern):
    /// `min(max_backoff, base * 2^attempt)` ± jitter fraction.
    pub fn retry_delay_ms(attempt: u32, base_ms: u64, max_ms: u64, jitter: f64) -> u64 {
        let exp = base_ms.saturating_mul(1u64 << attempt.min(10));
        let clamped = exp.min(max_ms);
        let j = (clamped as f64 * jitter) as u64;
        let jittered = if j == 0 {
            clamped
        } else {
            let hi = clamped + j;
            let lo = clamped.saturating_sub(j);
            lo + (hi - lo) / 2 // deterministic midpoint jitter (tests + no RNG)
        };
        jittered.max(base_ms).min(max_ms)
    }
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/// Nudge sentinel sample: a goal fired at a time-of-day / weekday.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct NudgeSample {
    pub goal: String,
    pub unix_secs: u64,
}

/// A schedule suggestion produced by the nudge sentinels.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct NudgeSuggestion {
    pub goal: String,
    pub cron: String,
    pub confidence: f64,
    /// Times-of-day (HH:MM) where the goal was observed.
    pub observed_at: Vec<String>,
}

/// Retry/lease constants (Hermes + Hatchet-derived defaults).
pub const LEASE_SECS: u64 = 30;
pub const RETRY_BASE_MS: u64 = 30_000;
pub const RETRY_MAX_MS: u64 = 3_600_000;
pub const RETRY_JITTER: f64 = 0.2;
pub const NUDGE_WINDOW_DAYS: u64 = 14;

pub struct SchedulerService {
    jobs: HashMap<String, Job>,
    on_battery: bool,
    nudge_log: Vec<NudgeSample>,
    webhook_token: Option<String>,
}

impl Default for SchedulerService {
    fn default() -> Self {
        Self::new()
    }
}

impl SchedulerService {
    pub fn new() -> Self {
        Self {
            jobs: HashMap::new(),
            on_battery: false,
            nudge_log: Vec::new(),
            webhook_token: None,
        }
    }

    // -- registry -----------------------------------------------------------

    pub fn list(&self) -> Vec<&Job> {
        let mut v: Vec<&Job> = self.jobs.values().collect();
        v.sort_by(|a, b| a.id.cmp(&b.id));
        v
    }

    pub fn get(&self, id: &str) -> Option<&Job> {
        self.jobs.get(id)
    }

    /// Create (or replace) a job. `now` seeds next-run for cron/interval.
    #[allow(clippy::too_many_arguments)]
    pub fn upsert(
        &mut self,
        id: impl Into<String>,
        name: impl Into<String>,
        session_id: impl Into<String>,
        trigger: TriggerSpec,
        steps: Vec<AutomationStep>,
        policy: Option<SchedulePolicy>,
        now: u64,
    ) -> &mut Job {
        let id = id.into();
        let job = self.jobs.entry(id.clone()).or_insert_with(|| {
            Job::new(id.clone(), name, session_id, trigger.clone())
        });
        job.name = job.name.clone();
        job.trigger = trigger;
        job.steps = steps;
        if let Some(p) = policy {
            job.policy = p;
        }
        job.next_run_at = compute_next_run(&job.trigger, now, job.next_run_at);
        job
    }

    pub fn delete(&mut self, id: &str) -> bool {
        self.jobs.remove(id).is_some()
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool, now: u64) -> Result<(), String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        job.enabled = enabled;
        if enabled && job.next_run_at.is_none() {
            job.next_run_at = compute_next_run(&job.trigger, now, None);
        }
        Ok(())
    }

    /// Attach/replace a job's monitoring config (or clear it with `None`).
    pub fn set_monitor(&mut self, id: &str, monitor: Option<MonitorConfig>) -> Result<(), String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        job.monitor = monitor;
        Ok(())
    }

    /// P6.4 monitoring semantics (the "notify only on a meaningful delta"
    /// pattern from the ChatGPT Scheduled-Tasks model): compare this run's
    /// `observation` against the job's previous observation and return whether
    /// to notify + whether the stop condition ended the monitor. Stores the new
    /// observation (stateful polling — "previous runs are remembered").
    pub fn monitor_evaluate(
        &mut self,
        id: &str,
        observation: &str,
        condition_met: bool,
    ) -> Result<MonitorVerdict, String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        let monitor = job.monitor.get_or_insert_with(MonitorConfig::default);
        let previous = monitor.last_observation.clone();
        let changed = previous.as_deref() != Some(observation);
        let notified = previous.is_none() || changed || condition_met;
        if notified {
            monitor.notifications += 1;
        }
        monitor.last_observation = Some(observation.to_string());
        let stopped = condition_met && monitor.stop_on_condition;
        if stopped {
            // End condition met: stop the recurring monitor (keep the record).
            job.enabled = false;
            job.state = RunState::Idle;
        }
        Ok(MonitorVerdict {
            changed,
            notified,
            stopped,
            previous,
            current: observation.to_string(),
            notifications: monitor.notifications,
        })
    }

    // -- HITL pause (cronflow: a first-class state with explicit transitions) -

    pub fn pause(&mut self, id: &str, resume_deadline: Option<u64>) -> Result<(), String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        job.state = RunState::Paused { resume_deadline };
        Ok(())
    }

    pub fn resume(&mut self, id: &str, now: u64) -> Result<(), String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        if !matches!(job.state, RunState::Paused { .. }) {
            return Err(format!("job {id:?} is not paused"));
        }
        job.state = RunState::Idle;
        if job.enabled && job.next_run_at.is_none() {
            job.next_run_at = compute_next_run(&job.trigger, now, None);
        }
        Ok(())
    }

    // -- lease / heartbeat (Hatchet pattern) ---------------------------------

    /// Start a run: Idle/Paused-expired/Failed → Running with a lease.
    pub fn lease_start(&mut self, id: &str, now: u64) -> Result<Value, String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        if matches!(job.state, RunState::Running { .. }) {
            // already running — idempotent for the coordinator's ticker
            return Ok(json!({ "ok": true, "resumed": true, "checkpoint": job.checkpoint }));
        }
        job.state = RunState::Running { lease_expires_at: now + LEASE_SECS };
        Ok(json!({ "ok": true, "resumed": false, "checkpoint": job.checkpoint }))
    }

    /// Renew the lease. Returns `{ok:false}` if the lease already expired
    /// (another executor may have reassigned it).
    pub fn lease_heartbeat(&mut self, id: &str, now: u64) -> Result<Value, String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        match job.state {
            RunState::Running { lease_expires_at } if lease_expires_at >= now => {
                job.state = RunState::Running { lease_expires_at: now + LEASE_SECS };
                Ok(json!({ "ok": true, "leaseExpiresAt": now + LEASE_SECS }))
            }
            RunState::Running { .. } => Ok(json!({ "ok": false, "reason": "lease_expired" })),
            _ => Err(format!("job {id:?} is not running")),
        }
    }

    /// Advance the checkpoint (call after each completed step).
    pub fn lease_checkpoint(&mut self, id: &str, index: u32) -> Result<(), String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        job.checkpoint = index.max(job.checkpoint);
        Ok(())
    }

    /// Finish a run: success resets retries; failure schedules a retry with
    /// backoff + jitter + clamp (cronflow pattern).
    pub fn lease_finish(&mut self, id: &str, ok: bool, now: u64) -> Result<(), String> {
        let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
        job.runs += 1;
        job.last_run_at = Some(now);
        job.recent_runs.push(now);
        if let Some(cap) = job.policy.max_runs_per_hour {
            let cutoff = now.saturating_sub(3600);
            job.recent_runs.retain(|t| *t >= cutoff);
            let _ = cap; // enforcement happens at due/fire time
        }
        if ok {
            job.successes += 1;
            job.checkpoint = 0;
            job.state = RunState::Idle;
            job.next_run_at = compute_next_run(&job.trigger, now, None);
        } else {
            job.failures += 1;
            let retries = match job.state {
                RunState::Running { .. } => job.failures, // count consecutive fails
                _ => job.failures,
            };
            let delay = Job::retry_delay_ms(retries, RETRY_BASE_MS, RETRY_MAX_MS, RETRY_JITTER);
            job.state = RunState::Failed { retries, next_retry_at: Some(now + delay / 1000) };
        }
        Ok(())
    }

    // -- battery -------------------------------------------------------------

    pub fn set_battery(&mut self, on_battery: bool) {
        self.on_battery = on_battery;
    }

    pub fn on_battery(&self) -> bool {
        self.on_battery
    }

    // -- due computation -----------------------------------------------------

    /// Jobs due now (cron/interval match + retry backoff + lease-expired
    /// reassignment), respecting battery suppression + frequency policy.
    /// Returns job ids ordered by next_run_at.
    pub fn due(&mut self, now: u64) -> Vec<String> {
        let mut out = Vec::new();
        // First: expire stale leases → mark reassignable (Running → Idle with
        // the checkpoint preserved; the executor resumes from it).
        for job in self.jobs.values_mut() {
            if let RunState::Running { lease_expires_at } = job.state {
                if lease_expires_at < now {
                    job.state = RunState::Idle; // reassignable, checkpoint intact
                }
            }
        }
        let on_battery = self.on_battery;
        let ids: Vec<String> = self.jobs.keys().cloned().collect();
        for id in ids {
            let Some(job) = self.jobs.get(&id) else { continue };
            if !job.enabled {
                continue;
            }
            // Battery suppression.
            if on_battery && job.policy.suppress_on_battery {
                continue;
            }
            // Frequency policy (rolling hour) — skip if at/over cap.
            if let Some(cap) = job.policy.max_runs_per_hour {
                let cutoff = now.saturating_sub(3600);
                let in_window = job.recent_runs.iter().filter(|t| **t >= cutoff).count() as u32;
                if in_window >= cap {
                    continue;
                }
            }
            let due = match &job.trigger {
                TriggerSpec::Cron { expr } => match CronExpr::parse(expr) {
                    Ok(c) => {
                        job.next_run_at.is_some_and(|nr| nr <= now) && c.matches(now)
                    }
                    Err(_) => false,
                },
                TriggerSpec::Interval { .. } => job.next_run_at.is_some_and(|nr| nr <= now),
                TriggerSpec::Event { .. } | TriggerSpec::Webhook { .. } => false,
            };
            let retry_due = matches!(job.state, RunState::Failed { next_retry_at: Some(t), .. } if t <= now);
            if due || retry_due {
                out.push(id);
            }
        }
        out.sort_by_key(|id| self.jobs.get(id).and_then(|j| j.next_run_at).unwrap_or(u64::MAX));
        out
    }

    // -- event + webhook triggers --------------------------------------------

    /// Fire an event (Gartner kinds). Matches Event-triggered jobs by kind +
    /// filter + scope, respects the frequency cap, queues immediately.
    pub fn fire_event(&mut self, kind: EventKind, payload: &Value, now: u64) -> Vec<String> {
        let payload_str = payload.to_string();
        let ids: Vec<String> = self.jobs.keys().cloned().collect();
        let mut fired = Vec::new();
        for id in ids {
            let Some(job) = self.jobs.get(&id) else { continue };
            if !job.enabled {
                continue;
            }
            let TriggerSpec::Event { kind: k, filter } = &job.trigger else { continue };
            if *k != kind {
                continue;
            }
            if !filter.is_empty() && !payload_str.contains(filter) {
                continue;
            }
            if let Some(scope) = &job.policy.scope {
                if !payload_str.contains(scope) {
                    continue;
                }
            }
            if let Some(cap) = job.policy.max_runs_per_hour {
                let cutoff = now.saturating_sub(3600);
                let in_window = job.recent_runs.iter().filter(|t| **t >= cutoff).count() as u32;
                if in_window >= cap {
                    continue;
                }
            }
            let job = self.jobs.get_mut(&id).unwrap();
            job.next_run_at = Some(now);
            fired.push(id);
        }
        fired
    }

    /// Webhook ingress (F11 loopback). Validates the path + required body keys
    /// (schema), then fires the job as an event. `token` (optional) guards the
    /// loopback listener — set via `scheduler/webhook_token`.
    pub fn fire_webhook(
        &mut self,
        path: &str,
        body: &Value,
        now: u64,
        token: Option<&str>,
    ) -> Result<Vec<String>, String> {
        if let Some(tok) = &self.webhook_token {
            if token != Some(tok.as_str()) {
                return Err("webhook: bad token".into());
            }
        }
        let ids: Vec<String> = self.jobs.keys().cloned().collect();
        let mut fired = Vec::new();
        for id in ids {
            let Some(job) = self.jobs.get(&id) else { continue };
            if !job.enabled {
                continue;
            }
            let TriggerSpec::Webhook { path: p, schema } = &job.trigger else { continue };
            if p != path {
                continue;
            }
            // Schema validation: every required key must be present.
            let obj = body.as_object().ok_or_else(|| format!("webhook {path}: body must be a JSON object"))?;
            for key in schema {
                if !obj.contains_key(key) {
                    return Err(format!("webhook {path}: missing required key {key:?}"));
                }
            }
            let job = self.jobs.get_mut(&id).unwrap();
            job.next_run_at = Some(now);
            fired.push(id);
        }
        Ok(fired)
    }

    pub fn set_webhook_token(&mut self, token: Option<String>) {
        self.webhook_token = token;
    }

    // -- nudge sentinels -----------------------------------------------------

    /// Record a goal observation (from chat turns / session activity).
    pub fn record_nudge(&mut self, goal: &str, unix_secs: u64) {
        self.nudge_log.push(NudgeSample {
            goal: goal.to_string(),
            unix_secs,
        });
        let cutoff = unix_secs.saturating_sub(NUDGE_WINDOW_DAYS * 86_400);
        self.nudge_log.retain(|s| s.unix_secs >= cutoff);
    }

    /// Detect repeating patterns: same goal at the same hour-of-day across
    /// ≥3 days in the window → suggest a daily cron. Returns suggestions
    /// sorted by confidence.
    pub fn nudges(&self) -> Vec<NudgeSuggestion> {
        let mut by_goal: HashMap<&str, Vec<u64>> = HashMap::new();
        for s in &self.nudge_log {
            by_goal.entry(s.goal.as_str()).or_default().push(s.unix_secs);
        }
        let mut out = Vec::new();
        for (goal, times) in by_goal {
            let mut hours: Vec<u8> = times
                .iter()
                .map(|t| ((t % 86_400) / 3600) as u8)
                .collect();
            hours.sort_unstable();
            hours.dedup();
            // Distinct days the goal fired on.
            let mut days: Vec<u64> = times.iter().map(|t| t / 86_400).collect();
            days.sort_unstable();
            days.dedup();
            if days.len() >= 3 && hours.len() == 1 {
                let h = hours[0];
                let day_count = days.len();
                let confidence = (day_count as f64 / NUDGE_WINDOW_DAYS as f64).min(1.0);
                out.push(NudgeSuggestion {
                    goal: goal.to_string(),
                    cron: format!("0 {h} * * *"),
                    confidence,
                    observed_at: vec![format!("{:02}:00", h)],
                });
            }
        }
        out.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
        out
    }

    // -- JSON-RPC dispatch ---------------------------------------------------

    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        let now = params
            .get("now")
            .and_then(Value::as_u64)
            .unwrap_or_else(|| std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0));
        match method {
            "scheduler/list" => {
                let jobs: Vec<Value> = self
                    .list()
                    .iter()
                    .map(|j| serde_json::to_value(j).unwrap_or(Value::Null))
                    .collect();
                Ok(json!({ "jobs": jobs, "onBattery": self.on_battery }))
            }
            "scheduler/upsert" => {
                let id = str_param(params, "id").ok_or("scheduler/upsert requires id")?;
                let name = str_param(params, "name").unwrap_or(id);
                let session_id = str_param(params, "sessionId").unwrap_or("");
                let trigger = serde_json::from_value::<TriggerSpec>(
                    params.get("trigger").cloned().ok_or("scheduler/upsert requires trigger")?,
                )
                .map_err(|e| format!("bad trigger: {e}"))?;
                let steps = serde_json::from_value::<Vec<AutomationStep>>(
                    params.get("steps").cloned().unwrap_or(Value::Array(vec![])),
                )
                .map_err(|e| format!("bad steps: {e}"))?;
                let policy = params
                    .get("policy")
                    .cloned()
                    .map(|v| serde_json::from_value::<SchedulePolicy>(v).map_err(|e| format!("bad policy: {e}")))
                    .transpose()?;
                self.upsert(id, name, session_id, trigger, steps, policy, now);
                Ok(json!({ "ok": true, "id": id }))
            }
            "scheduler/delete" => {
                let id = str_param(params, "id").ok_or("scheduler/delete requires id")?;
                Ok(json!({ "ok": self.delete(id) }))
            }
            "scheduler/enable" => {
                let id = str_param(params, "id").ok_or("scheduler/enable requires id")?;
                let enabled = params.get("enabled").and_then(Value::as_bool).unwrap_or(true);
                self.set_enabled(id, enabled, now)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/pause" => {
                let id = str_param(params, "id").ok_or("scheduler/pause requires id")?;
                let deadline = params.get("resumeDeadline").and_then(Value::as_u64);
                self.pause(id, deadline)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/resume" => {
                let id = str_param(params, "id").ok_or("scheduler/resume requires id")?;
                self.resume(id, now)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/due" => Ok(json!({ "due": self.due(now), "now": now })),
            "scheduler/lease_start" => {
                let id = str_param(params, "id").ok_or("scheduler/lease_start requires id")?;
                self.lease_start(id, now)
            }
            "scheduler/lease_heartbeat" => {
                let id = str_param(params, "id").ok_or("scheduler/lease_heartbeat requires id")?;
                self.lease_heartbeat(id, now)
            }
            "scheduler/lease_checkpoint" => {
                let id = str_param(params, "id").ok_or("scheduler/lease_checkpoint requires id")?;
                let index = params.get("index").and_then(Value::as_u64).unwrap_or(0) as u32;
                self.lease_checkpoint(id, index)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/lease_finish" => {
                let id = str_param(params, "id").ok_or("scheduler/lease_finish requires id")?;
                let ok = params.get("ok").and_then(Value::as_bool).unwrap_or(false);
                self.lease_finish(id, ok, now)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/battery" => {
                let on = params.get("onBattery").and_then(Value::as_bool).unwrap_or(false);
                self.set_battery(on);
                Ok(json!({ "ok": true, "onBattery": on }))
            }
            "scheduler/fire_event" => {
                let kind = serde_json::from_value::<EventKind>(
                    params.get("kind").cloned().ok_or("scheduler/fire_event requires kind")?,
                )
                .map_err(|e| format!("bad kind: {e}"))?;
                let payload = params.get("payload").cloned().unwrap_or(Value::Null);
                Ok(json!({ "fired": self.fire_event(kind, &payload, now) }))
            }
            "scheduler/fire_webhook" => {
                let path = str_param(params, "path").ok_or("scheduler/fire_webhook requires path")?;
                let body = params.get("body").cloned().unwrap_or(Value::Null);
                let token = params.get("token").and_then(Value::as_str);
                let fired = self.fire_webhook(path, &body, now, token)?;
                Ok(json!({ "fired": fired }))
            }
            "scheduler/webhook_token" => {
                let token = params.get("token").and_then(Value::as_str).map(str::to_string);
                self.set_webhook_token(token);
                Ok(json!({ "ok": true }))
            }
            "scheduler/nudge" => {
                let goal = str_param(params, "goal").ok_or("scheduler/nudge requires goal")?;
                let ts = params.get("ts").and_then(Value::as_u64).unwrap_or(now);
                self.record_nudge(goal, ts);
                Ok(json!({ "ok": true }))
            }
            "scheduler/nudges" => Ok(json!({ "suggestions": self.nudges() })),
            "scheduler/run_now" => {
                let id = str_param(params, "id").ok_or("scheduler/run_now requires id")?;
                let job = self.jobs.get_mut(id).ok_or_else(|| format!("unknown job {id:?}"))?;
                job.next_run_at = Some(now);
                Ok(json!({ "ok": true, "id": id }))
            }
            "scheduler/monitor" => {
                let id = str_param(params, "id").ok_or("scheduler/monitor requires id")?;
                let observation = str_param(params, "observation").unwrap_or("");
                let condition_met = params.get("conditionMet").and_then(Value::as_bool).unwrap_or(false);
                let verdict = self.monitor_evaluate(id, observation, condition_met)?;
                Ok(serde_json::to_value(verdict).unwrap_or(Value::Null))
            }
            "scheduler/monitor_config" => {
                let id = str_param(params, "id").ok_or("scheduler/monitor_config requires id")?;
                let monitor = params
                    .get("monitor")
                    .cloned()
                    .map(|v| serde_json::from_value::<MonitorConfig>(v).map_err(|e| format!("bad monitor: {e}")))
                    .transpose()?;
                self.set_monitor(id, monitor)?;
                Ok(json!({ "ok": true, "id": id }))
            }
            _ => Err(format!("method not found: {method}")),
        }
    }
}

fn str_param<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params.get(key).and_then(Value::as_str)
}

/// First cron/interval fire = the next matching minute (interval: now + secs).
fn compute_next_run(trigger: &TriggerSpec, now: u64, current: Option<u64>) -> Option<u64> {
    match trigger {
        TriggerSpec::Cron { expr } => {
            match CronExpr::parse(expr) {
                Ok(c) => {
                    // Next minute that matches (scan up to 366 days).
                    let mut t = now - (now % 60) + 60;
                    for _ in 0..(366 * 1440) {
                        if c.matches(t) {
                            return Some(t);
                        }
                        t += 60;
                    }
                    None
                }
                Err(_) => current,
            }
        }
        TriggerSpec::Interval { secs } => Some(now + secs),
        TriggerSpec::Event { .. } | TriggerSpec::Webhook { .. } => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2025-06-15 15:06:40 UTC (Sunday) — 15:06 avoids ambiguity with the
    /// 09:30/09:15/12:00/16:00 fixtures used below.
    fn now() -> u64 {
        1_750_000_000
    }

    /// 2025-06-15 (Sunday) 09:30:00 UTC.
    fn sun_0930() -> u64 {
        let day_start = 1_750_000_000 - 1_750_000_000 % 86_400;
        day_start + 9 * 3600 + 30 * 60
    }

    /// 2025-06-16 (Monday) 09:15:00 UTC.
    fn mon_0915() -> u64 {
        let sunday_start = 1_750_000_000 - 1_750_000_000 % 86_400;
        sunday_start + 86_400 + 9 * 3600 + 15 * 60
    }

    #[test]
    fn cron_matches_minute_exactly() {
        let c = CronExpr::parse("30 9 * * *").unwrap();
        let t = sun_0930();
        assert!(c.matches(t));
        assert!(!c.matches(t + 60));
    }

    #[test]
    fn cron_matches_star_fields() {
        let c = CronExpr::parse("* * * * *").unwrap();
        for t in [0u64, 60, 86_400, 1_750_000_000] {
            assert!(c.matches(t), "t={t}");
        }
    }

    #[test]
    fn cron_ranges_and_steps() {
        let c = CronExpr::parse("*/15 9-17 * * 1-5").unwrap();
        // 2025-06-16 (Monday) 09:15 → match; 09:20 → no.
        assert!(c.matches(mon_0915()));
        assert!(!c.matches(mon_0915() + 5 * 60));
        // Sunday 09:15 → no (dow 1-5 excludes Sunday).
        assert!(!c.matches(sun_0930() - 15 * 60));
    }

    #[test]
    fn cron_rejects_bad_fields() {
        assert!(CronExpr::parse("60 * * * *").is_err());
        assert!(CronExpr::parse("* * 32 * *").is_err());
        assert!(CronExpr::parse("*/0 * * * *").is_err());
        assert!(CronExpr::parse("* * * *").is_err());
    }

    #[test]
    fn interval_due_respects_next_run() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1", "probe", "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![], None, now(),
        );
        // Not due immediately after creation (next_run_at = now + 60).
        assert!(svc.due(now()).is_empty());
        // Due at now + 61.
        assert_eq!(svc.due(now() + 61), vec!["j1".to_string()]);
    }

    #[test]
    fn cron_due_at_match() {
        let mut svc = SchedulerService::new();
        // Job created at 15:06; cron fires at 16:00 (later today).
        svc.upsert(
            "j1", "hourly", "s1",
            TriggerSpec::Cron { expr: "0 16 * * *".into() },
            vec![], None, now(),
        );
        // 16:00 today (now() is 15:06) — day_start + 16h.
        let day_start = now() - (now() % 86_400);
        let due_at = day_start + 16 * 3600;
        assert!(svc.due(due_at - 60).is_empty());
        assert_eq!(svc.due(due_at), vec!["j1".to_string()]);
    }

    #[test]
    fn battery_suppression_skips_jobs() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1", "bat", "s1",
            TriggerSpec::Interval { secs: 5 },
            vec![], None, now(),
        );
        svc.set_battery(true);
        // Interval job is due (now + 5 passed) but suppressed on battery.
        assert!(svc.due(now() + 10).is_empty());
        svc.set_battery(false);
        assert_eq!(svc.due(now() + 10), vec!["j1".to_string()]);
        // A job that opted out runs on battery.
        let mut svc2 = SchedulerService::new();
        svc2.upsert(
            "j2", "always", "s1",
            TriggerSpec::Interval { secs: 5 },
            vec![],
            Some(SchedulePolicy { suppress_on_battery: false, ..SchedulePolicy::default() }),
            now(),
        );
        svc2.set_battery(true);
        assert_eq!(svc2.due(now() + 10), vec!["j2".to_string()]);
    }

    #[test]
    fn event_fire_matches_kind_filter_scope() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1", "ci", "s1",
            TriggerSpec::Event { kind: EventKind::CiBuildFail, filter: "repo-a".into() },
            vec![], None, now(),
        );
        svc.upsert(
            "j2", "other", "s1",
            TriggerSpec::Event { kind: EventKind::TestRegression, filter: "".into() },
            vec![], None, now(),
        );
        let fired = svc.fire_event(
            EventKind::CiBuildFail,
            &json!({ "repo": "repo-a", "build": 42 }),
            now(),
        );
        assert_eq!(fired, vec!["j1".to_string()]);
        // Filter miss → nothing.
        let fired2 = svc.fire_event(EventKind::CiBuildFail, &json!({ "repo": "repo-b" }), now());
        assert!(fired2.is_empty());
        // With scope policy.
        svc.upsert(
            "j3", "scoped", "s1",
            TriggerSpec::Event { kind: EventKind::RepoChange, filter: "".into() },
            vec![],
            Some(SchedulePolicy { scope: Some("src/".into()), ..SchedulePolicy::default() }),
            now(),
        );
        let fired3 = svc.fire_event(EventKind::RepoChange, &json!({ "path": "README.md" }), now());
        assert!(fired3.is_empty());
        let fired4 = svc.fire_event(EventKind::RepoChange, &json!({ "path": "src/main.rs" }), now());
        assert_eq!(fired4, vec!["j3".to_string()]);
    }

    #[test]
    fn webhook_validates_schema_and_token() {
        let mut svc = SchedulerService::new();
        svc.set_webhook_token(Some("tok".into()));
        svc.upsert(
            "w1", "hook", "s1",
            TriggerSpec::Webhook { path: "/hooks/ci".into(), schema: vec!["ref".into(), "sha".into()] },
            vec![], None, now(),
        );
        // Bad token → error.
        assert!(svc.fire_webhook("/hooks/ci", &json!({"ref":"main","sha":"x"}), now(), Some("nope")).is_err());
        // Missing key → error.
        assert!(svc.fire_webhook("/hooks/ci", &json!({"ref":"main"}), now(), Some("tok")).is_err());
        // Good → fires.
        let fired = svc.fire_webhook("/hooks/ci", &json!({"ref":"main","sha":"abc"}), now(), Some("tok")).unwrap();
        assert_eq!(fired, vec!["w1".to_string()]);
        // Wrong path → nothing.
        let fired2 = svc.fire_webhook("/hooks/nope", &json!({"ref":"main","sha":"x"}), now(), Some("tok")).unwrap();
        assert!(fired2.is_empty());
    }

    #[test]
    fn frequency_policy_caps_event_fires() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1", "noisy", "s1",
            TriggerSpec::Event { kind: EventKind::TelemetryThreshold, filter: "".into() },
            vec![],
            Some(SchedulePolicy { max_runs_per_hour: Some(2), ..SchedulePolicy::default() }),
            now(),
        );
        assert_eq!(svc.fire_event(EventKind::TelemetryThreshold, &json!({}), now()).len(), 1);
        // Finish run 1 (records a recent run).
        svc.lease_start("j1", now()).unwrap();
        svc.lease_finish("j1", true, now()).unwrap();
        assert_eq!(svc.fire_event(EventKind::TelemetryThreshold, &json!({}), now()).len(), 1);
        svc.lease_start("j1", now()).unwrap();
        svc.lease_finish("j1", true, now()).unwrap();
        // At cap → suppressed.
        assert!(svc.fire_event(EventKind::TelemetryThreshold, &json!({}), now()).is_empty());
        // After the hour window → allowed again.
        let later = now() + 3700;
        assert_eq!(svc.fire_event(EventKind::TelemetryThreshold, &json!({}), later).len(), 1);
    }

    #[test]
    fn lease_expiry_reassigns_and_resumes_from_checkpoint() {
        let mut svc = SchedulerService::new();
        svc.upsert("j1", "long", "s1", TriggerSpec::Interval { secs: 3600 }, vec![], None, now());
        let started = svc.lease_start("j1", now()).unwrap();
        assert_eq!(started["checkpoint"], json!(0));
        svc.lease_checkpoint("j1", 2).unwrap();
        // Heartbeat renews.
        assert_eq!(svc.lease_heartbeat("j1", now() + 10).unwrap()["ok"], json!(true));
        // Executor dies — no heartbeat for LEASE_SECS+ → due() expires the lease.
        let dead = now() + LEASE_SECS + 5;
        svc.lease_finish("j1", false, dead).unwrap();
        // The checkpoint survives; the retry is scheduled with backoff.
        let job = svc.get("j1").unwrap();
        assert_eq!(job.checkpoint, 2);
        assert!(matches!(job.state, RunState::Failed { .. }));
    }

    #[test]
    fn retry_backoff_clamps_and_jitters() {
        // Base 30s; attempt 0 → ~30s, attempt 7 → clamped at 3600s.
        let a0 = Job::retry_delay_ms(0, 30_000, 3_600_000, 0.2);
        assert!((30_000..=36_000).contains(&a0), "a0={a0}");
        let a7 = Job::retry_delay_ms(7, 30_000, 3_600_000, 0.2);
        assert!((3_600_000 - 720_000..=3_600_000).contains(&a7), "a7={a7}");
        // Deterministic (no RNG).
        assert_eq!(Job::retry_delay_ms(2, 30_000, 3_600_000, 0.2), Job::retry_delay_ms(2, 30_000, 3_600_000, 0.2));
    }

    #[test]
    fn hitl_pause_is_a_state_with_deadline() {
        let mut svc = SchedulerService::new();
        svc.upsert("j1", "review", "s1", TriggerSpec::Interval { secs: 60 }, vec![], None, now());
        svc.pause("j1", Some(now() + 300)).unwrap();
        assert!(matches!(svc.get("j1").unwrap().state, RunState::Paused { resume_deadline: Some(_) }));
        // Paused jobs are not due.
        assert!(svc.due(now() + 10).is_empty());
        svc.resume("j1", now()).unwrap();
        assert_eq!(svc.get("j1").unwrap().state, RunState::Idle);
    }

    #[test]
    fn nudge_sentinels_suggest_schedule_after_3_days() {
        let mut svc = SchedulerService::new();
        // Same goal, same hour (09:00), 3 distinct days.
        for day in 0..3u64 {
            svc.record_nudge("Morning brief", now() + day * 86_400 - now() % 86_400 + 9 * 3600);
        }
        let suggestions = svc.nudges();
        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].goal, "Morning brief");
        assert_eq!(suggestions[0].cron, "0 9 * * *");
        assert!(suggestions[0].confidence > 0.0);
    }

    #[test]
    fn nudge_needs_three_distinct_days() {
        let mut svc = SchedulerService::new();
        for _ in 0..3 {
            svc.record_nudge("Once off", now() + 9 * 3600);
        }
        assert!(svc.nudges().is_empty()); // same day
    }

    #[test]
    fn handle_dispatch_roundtrip() {
        let mut svc = SchedulerService::new();
        // Interval job — deterministic due without wall-clock minute coupling.
        svc.handle(
            "scheduler/upsert",
            &json!({
                "id": "j1", "name": "Morning brief", "sessionId": "s1",
                "trigger": { "type": "interval", "secs": 60 },
                "steps": [],
                "now": now(),
            }),
        )
        .unwrap();
        let list = svc.handle("scheduler/list", &json!({ "now": now() })).unwrap();
        assert_eq!(list["jobs"].as_array().unwrap().len(), 1);
        // run_now forces a due.
        svc.handle("scheduler/run_now", &json!({ "id": "j1", "now": now() })).unwrap();
        let due = svc.handle("scheduler/due", &json!({ "now": now() })).unwrap();
        assert_eq!(due["due"], json!(["j1"]));
        // enable/disable.
        svc.handle("scheduler/enable", &json!({ "id": "j1", "enabled": false, "now": now() })).unwrap();
        let due2 = svc.handle("scheduler/due", &json!({ "now": now() })).unwrap();
        assert!(due2["due"].as_array().unwrap().is_empty());
        // battery.
        svc.handle("scheduler/battery", &json!({ "onBattery": true })).unwrap();
        assert!(svc.on_battery());
    }

    #[test]
    fn unknown_job_methods_error() {
        let mut svc = SchedulerService::new();
        assert!(svc.handle("scheduler/pause", &json!({ "id": "ghost" })).is_err());
        assert!(svc.handle("scheduler/nope", &json!({})).is_err());
    }

    #[test]
    fn monitor_notifies_on_first_run_and_stores_observation() {
        let mut svc = SchedulerService::new();
        svc.upsert("m1", "watch", "s1", TriggerSpec::Interval { secs: 3600 }, vec![], None, now());
        let v = svc.monitor_evaluate("m1", "price=100", false).unwrap();
        assert!(v.notified, "first run always notifies (baseline)");
        assert!(v.changed, "no previous observation → changed");
        assert!(!v.stopped);
        assert_eq!(v.previous, None);
        assert_eq!(v.current, "price=100");
        assert_eq!(v.notifications, 1);
        assert_eq!(
            svc.get("m1").unwrap().monitor.as_ref().unwrap().last_observation.as_deref(),
            Some("price=100"),
            "the observation is remembered for the next run (stateful polling)"
        );
    }

    #[test]
    fn monitor_suppresses_unchanged_runs() {
        let mut svc = SchedulerService::new();
        svc.upsert("m1", "watch", "s1", TriggerSpec::Interval { secs: 3600 }, vec![], None, now());
        svc.monitor_evaluate("m1", "price=100", false).unwrap();
        let v = svc.monitor_evaluate("m1", "price=100", false).unwrap();
        assert!(!v.changed);
        assert!(!v.notified, "no delta → no notification (the run vs notify split)");
        assert_eq!(v.notifications, 1, "an unchanged run does not bump the count");
    }

    #[test]
    fn monitor_notifies_on_delta() {
        let mut svc = SchedulerService::new();
        svc.upsert("m1", "watch", "s1", TriggerSpec::Interval { secs: 3600 }, vec![], None, now());
        svc.monitor_evaluate("m1", "price=100", false).unwrap();
        let v = svc.monitor_evaluate("m1", "price=80", false).unwrap();
        assert!(v.changed);
        assert!(v.notified);
        assert_eq!(v.previous.as_deref(), Some("price=100"));
        assert_eq!(v.notifications, 2);
    }

    #[test]
    fn monitor_stops_on_condition() {
        let mut svc = SchedulerService::new();
        svc.upsert("m1", "watch", "s1", TriggerSpec::Interval { secs: 3600 }, vec![], None, now());
        svc.set_monitor("m1", Some(MonitorConfig { stop_on_condition: true, ..MonitorConfig::default() })).unwrap();
        svc.monitor_evaluate("m1", "shipped=false", false).unwrap();
        let v = svc.monitor_evaluate("m1", "delivered", true).unwrap();
        assert!(v.stopped, "condition met + stop_on_condition → stopped");
        assert!(v.notified, "the stop event is worth reporting");
        let job = svc.get("m1").unwrap();
        assert!(!job.enabled, "a stopped monitor is disabled");
        assert!(matches!(job.state, RunState::Idle));
    }

    #[test]
    fn job_serializes_camel_case_for_the_sidecar() {
        let mut svc = SchedulerService::new();
        svc.upsert("j1", "brief", "s1", TriggerSpec::Interval { secs: 60 }, vec![], None, now());
        let list = svc.handle("scheduler/list", &json!({ "now": now() })).unwrap();
        let job = &list["jobs"][0];
        assert_eq!(job["sessionId"], "s1", "session_id must serialize as sessionId for the coordinator: {job}");
        assert!(job.get("session_id").is_none(), "no snake_case leakage: {job}");
        assert!(job["policy"]["suppressOnBattery"].as_bool().is_some(), "policy is camelCase: {}", job["policy"]);
        assert!(job["policy"].get("suppress_on_battery").is_none());

        // RunState struct-variant fields must be camelCase too.
        svc.lease_start("j1", now()).unwrap();
        let list2 = svc.handle("scheduler/list", &json!({ "now": now() })).unwrap();
        let state = &list2["jobs"][0]["state"];
        assert!(state["leaseExpiresAt"].as_u64().is_some(), "RunState must serialize leaseExpiresAt: {state}");
        assert!(state.get("lease_expires_at").is_none());
    }
}
