//! Scheduled-task **trigger plane** (P6.4 — B7; re-scoped by `P71.3d` /
//! `ARCH/AUTOMATION.md` §9). The scheduler owns **definitions, triggers,
//! occurrences and admission policy — nothing else**:
//!
//! - trigger registry: cron · interval · event · webhook · window;
//! - cron math, next-due computation, trigger dedupe (one firing = one
//!   `mark_fired`, so a due job is never re-queued mid-flight);
//! - battery/wake policy, misfire policy (`run_once_on_resume` by
//!   construction: a stale `next_run_at` fires once, then advances),
//!   frequency admission (rolling-hour cap);
//! - monitor observation accounting (the "run vs notify" delta), nudge
//!   sentinels, incident ack-store, read-only doctor;
//! - durable persistence of that registry.
//!
//! It holds **no execution state**: no run state machine, no leases or
//! fences, no checkpoints, no retries, no run ledger. A trigger never
//! executes a task — it surfaces due jobs and the host (the Work kernel)
//! executes them (`AUTOMATION.md` §1, **I26**). Run history belongs to the
//! Event Log (**I3**); execution waits belong to Work's `WaitCondition`
//! (`AUTOMATION.md` §8), never to this plane.
//!
//! Patterns adopted (pattern-only, no copied code):
//! - cronflow (doc 56 §3, no LICENSE → reference only): webhook triggers
//!   with schema validation; HITL pause — here as a **trigger-plane flag**
//!   (stop firing); the execution-level pause state lives in Work.
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
            let v = range
                .parse::<u8>()
                .map_err(|_| format!("bad value {range}"))?;
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
            return Err(format!(
                "cron needs 5 fields, got {}: {source:?}",
                parts.len()
            ));
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
// Triggers and policy
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

/// Named civil-day windows above raw cron (H2 / P6.4). Fires once per day
/// at the window start hour (UTC + optional offset).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DayWindow {
    /// 06:00–11:59
    Morning,
    /// 12:00–17:59
    Afternoon,
    /// 18:00–21:59
    Evening,
}

impl DayWindow {
    pub fn start_hour(self) -> u8 {
        match self {
            Self::Morning => 6,
            Self::Afternoon => 12,
            Self::Evening => 18,
        }
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TriggerSpec {
    Cron {
        expr: String,
    },
    Interval {
        secs: u64,
    },
    /// Event-triggered; `filter` matches a payload field (repo path, ticket id
    /// pattern, metric name…). `scope` (in [`SchedulePolicy`]) narrows further.
    Event {
        kind: EventKind,
        filter: String,
    },
    /// Loopback webhook ingress (F11); `path` is the URL path, `schema` lists
    /// required body keys (validated before the job is queued).
    Webhook {
        path: String,
        schema: Vec<String>,
    },
    /// Broader time window (morning / afternoon / evening) — a schedule
    /// primitive above raw cron.
    Window {
        window: DayWindow,
        #[serde(default, alias = "utcOffsetMinutes")]
        utc_offset_minutes: i32,
    },
}

/// Admission policy per job (doc 62 §3: scope + frequency; battery-aware B7).
/// Concurrency-and-misfire policy **around** Work (`AUTOMATION.md` §7) — not
/// an execution policy: nothing here runs a task.
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

/// Monitor-script mode (P51.32b): how a monitor produces observations.
/// `Llm` is the default analyst path; `Script` runs a command whose stdout
/// is stored verbatim as the observation.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MonitorSource {
    #[default]
    Llm,
    Script {
        cmd: String,
        #[serde(default, rename = "allowNet", alias = "allow_net")]
        allow_net: bool,
    },
}

/// Monitoring semantics (the ChatGPT "monitoring task" pattern): a recurring
/// job whose runs *observe* state and notify only on a meaningful delta,
/// remembering the previous observation between runs ("previous runs are
/// remembered"). `stop_on_condition` stops the monitor when the executor
/// reports the end condition met.
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
    /// Where observations come from (P51.32b). Defaults to `Llm` so existing
    /// persisted monitors keep their semantics.
    #[serde(default)]
    pub source: MonitorSource,
}

impl MonitorConfig {
    /// Script-mode evaluation (P51.32b): store `stdout` verbatim (no trim,
    /// no normalization). Empty output combined with `silent_on_empty`
    /// suppresses the notification (a quiet poll, not a delta).
    /// Pure w.r.t. stored state — returns the verdict without mutating;
    /// use [`SchedulerService::monitor_evaluate_script`] for the persisting path.
    pub fn evaluate_script(&self, stdout: &str, silent_on_empty: bool) -> MonitorVerdict {
        let current = stdout.to_string();
        let previous = self.last_observation.clone();
        let changed = previous.as_deref() != Some(stdout);
        let notified = if stdout.is_empty() && silent_on_empty {
            false
        } else {
            previous.is_none() || changed
        };
        let notifications = if notified {
            self.notifications.saturating_add(1)
        } else {
            self.notifications
        };
        MonitorVerdict {
            changed,
            notified,
            stopped: false,
            previous,
            current,
            notifications,
        }
    }
}

/// One trigger-plane job: a **definition + trigger**, never a run.
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
    /// Trigger-plane pause (cronflow HITL, chat-delete cascade): stop firing
    /// without losing the definition. Execution-level waiting (approval,
    /// user input, timer…) is Work's `WaitCondition` (`AUTOMATION.md` §8),
    /// never this flag.
    #[serde(default)]
    pub paused: bool,
    /// Next due unix time (cron/interval); None = waiting on an event.
    pub next_run_at: Option<u64>,
    /// Last fired unix time (occurrence record — "why did this run?" §4).
    #[serde(default)]
    pub last_fired_at: Option<u64>,
    /// Rolling 1h fire timestamps (frequency admission).
    #[serde(default)]
    pub recent_fires: Vec<u64>,
    /// Monitoring config (`None` = a plain scheduled/event job; lazily created
    /// by `monitor_evaluate` for delta-notify semantics).
    #[serde(default)]
    pub monitor: Option<MonitorConfig>,
    /// Scratch notepad carried across runs (P51.32a continuity — explicitly
    /// user/agent-curated notes; run results live in the Event Log, **I3**).
    #[serde(default)]
    pub notepad: String,
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
    /// was stopped (job disabled).
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
    fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        session_id: impl Into<String>,
        trigger: TriggerSpec,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            session_id: session_id.into(),
            trigger,
            policy: SchedulePolicy::default(),
            steps: Vec::new(),
            enabled: true,
            paused: false,
            next_run_at: None,
            last_fired_at: None,
            recent_fires: Vec::new(),
            monitor: None,
            notepad: String::new(),
        }
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

pub const NUDGE_WINDOW_DAYS: u64 = 14;
/// Registry soft cap (P51.32f doctor's `queue_depth` guard).
pub const REGISTRY_SOFT_CAP: usize = 500;

/// An incident (P51.32e): an explicit, ack-gated failure record.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub id: String,
    pub job_id: String,
    pub at_ms: u64,
    pub kind: String,
    pub detail: String,
    pub acked: bool,
}

/// A single doctor check (P51.32f).
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronCheck {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

pub struct SchedulerService {
    jobs: HashMap<String, Job>,
    on_battery: bool,
    nudge_log: Vec<NudgeSample>,
    webhook_token: Option<String>,
    /// P50.3.3 — durable job persistence. `Some(path)` ⇒ every mutation is
    /// written through to the JSON file (atomic tmp+rename, best-effort: a
    /// failed save is an error surfaced by `persist`, never a silent drop).
    persist_path: Option<std::path::PathBuf>,
    /// P51.32e — explicit-ack incident store.
    incidents: Vec<Incident>,
    incident_seq: u64,
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
            persist_path: None,
            incidents: Vec::new(),
            incident_seq: 0,
        }
    }

    /// P50.3.3 — open (or create) the service with a JSON file backing store.
    /// The trigger registry survives shell/coordinator restart. Recovery is
    /// misfire-policy-by-construction (`AUTOMATION.md` §7): a job whose
    /// `next_run_at` slipped past while the process was down fires **once**
    /// on the next due-cycle (`run_once_on_resume` — the default), then
    /// `mark_fired` advances it; it never replays every missed occurrence.
    pub fn load_or_new(path: std::path::PathBuf) -> Self {
        let mut svc = Self::new();
        svc.persist_path = Some(path.clone());
        if let Ok(bytes) = std::fs::read(&path) {
            if let Ok(jobs) = serde_json::from_slice::<Vec<Job>>(&bytes) {
                for job in jobs {
                    svc.jobs.insert(job.id.clone(), job);
                }
            }
        }
        svc
    }

    /// Write the job registry through to the backing file (best-effort:
    /// returns the error so callers can surface it, but persistence failure
    /// never mutates the in-memory state).
    pub fn persist(&self) -> Result<(), String> {
        let Some(path) = &self.persist_path else {
            return Ok(());
        };
        let mut jobs: Vec<&Job> = self.jobs.values().collect();
        jobs.sort_by(|a, b| a.id.cmp(&b.id));
        let json = serde_json::to_vec_pretty(&jobs).map_err(|e| format!("encode: {e}"))?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, &json).map_err(|e| format!("write: {e}"))?;
        std::fs::rename(&tmp, path).map_err(|e| format!("rename: {e}"))
    }

    /// Persist ignoring errors (for paths where the caller cannot propagate).
    fn persist_quiet(&self) {
        let _ = self.persist();
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
        {
            let job = self
                .jobs
                .entry(id.clone())
                .or_insert_with(|| Job::new(id.clone(), name, session_id, trigger.clone()));
            job.name = job.name.clone();
            job.trigger = trigger;
            job.steps = steps;
            if let Some(p) = policy {
                job.policy = p;
            }
            job.next_run_at = compute_next_run(&job.trigger, now, job.next_run_at);
        }
        self.persist_quiet();
        self.jobs.get_mut(&id).expect("job was just upserted")
    }

    pub fn delete(&mut self, id: &str) -> bool {
        let removed = self.jobs.remove(id).is_some();
        if removed {
            self.persist_quiet();
        }
        removed
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool, now: u64) -> Result<(), String> {
        let job = self
            .jobs
            .get_mut(id)
            .ok_or_else(|| format!("unknown job {id:?}"))?;
        job.enabled = enabled;
        if enabled && job.next_run_at.is_none() {
            job.next_run_at = compute_next_run(&job.trigger, now, None);
        }
        self.persist_quiet();
        Ok(())
    }

    /// Attach/replace a job's monitoring config (or clear it with `None`).
    pub fn set_monitor(&mut self, id: &str, monitor: Option<MonitorConfig>) -> Result<(), String> {
        let job = self
            .jobs
            .get_mut(id)
            .ok_or_else(|| format!("unknown job {id:?}"))?;
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
        let job = self
            .jobs
            .get_mut(id)
            .ok_or_else(|| format!("unknown job {id:?}"))?;
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

    // -- continuity (P51.32a) --------------------------------------------------

    /// Append one line to a job's notepad. Returns `false` for unknown jobs.
    /// (The notepad is the only continuity this plane keeps — run results are
    /// Event Log territory, **I3**.)
    pub fn append_notepad(&mut self, id: &str, line: &str) -> bool {
        let Some(job) = self.jobs.get_mut(id) else {
            return false;
        };
        if job.notepad.is_empty() {
            job.notepad = line.to_string();
        } else {
            job.notepad.push('\n');
            job.notepad.push_str(line);
        }
        self.persist_quiet();
        true
    }

    /// A job's durable notepad (`None` for unknown jobs).
    pub fn notepad(&self, id: &str) -> Option<String> {
        self.jobs.get(id).map(|j| j.notepad.clone())
    }

    // -- monitor-script mode (P51.32b) -----------------------------------------

    /// Stateful script-mode evaluation: stores `stdout` verbatim as the job's
    /// observation (no trim) with silent-empty semantics, mirroring
    /// [`Self::monitor_evaluate`] accounting.
    pub fn monitor_evaluate_script(
        &mut self,
        id: &str,
        stdout: &str,
        silent_on_empty: bool,
    ) -> Result<MonitorVerdict, String> {
        let job = self
            .jobs
            .get_mut(id)
            .ok_or_else(|| format!("unknown job {id:?}"))?;
        let monitor = job.monitor.get_or_insert_with(MonitorConfig::default);
        let snapshot = monitor.clone();
        let verdict = snapshot.evaluate_script(stdout, silent_on_empty);
        monitor.last_observation = Some(stdout.to_string());
        if verdict.notified {
            monitor.notifications = monitor.notifications.saturating_add(1);
        }
        Ok(MonitorVerdict {
            notifications: monitor.notifications,
            ..verdict
        })
    }

    /// Stateless script verdict helper on the service (same pure semantics as
    /// [`MonitorConfig::evaluate_script`], with no stored observation).
    pub fn evaluate_script(&self, stdout: &str, silent_on_empty: bool) -> MonitorVerdict {
        MonitorConfig::default().evaluate_script(stdout, silent_on_empty)
    }

    // -- trigger-plane pause -----------------------------------------------------

    /// Pause a job: stop firing without losing the definition (HITL pause,
    /// cronflow pattern). Returns `Ok(())` even if already paused.
    pub fn pause(&mut self, id: &str) -> Result<(), String> {
        let job = self
            .jobs
            .get_mut(id)
            .ok_or_else(|| format!("unknown job {id:?}"))?;
        job.paused = true;
        self.persist_quiet();
        Ok(())
    }

    /// Resume a paused job. Re-seeds next-run for schedule triggers that have
    /// none (event/webhook jobs keep waiting on their event).
    pub fn resume(&mut self, id: &str, now: u64) -> Result<(), String> {
        let job = self
            .jobs
            .get_mut(id)
            .ok_or_else(|| format!("unknown job {id:?}"))?;
        job.paused = false;
        if job.enabled && job.next_run_at.is_none() {
            job.next_run_at = compute_next_run(&job.trigger, now, None);
        }
        self.persist_quiet();
        Ok(())
    }

    /// Pause every job bound to `session_id` (chat-delete cascade). Returns
    /// how many jobs were newly paused.
    pub fn pause_session(&mut self, session_id: &str) -> usize {
        let mut n = 0usize;
        for job in self.jobs.values_mut() {
            if job.session_id == session_id && !job.paused {
                job.paused = true;
                n += 1;
            }
        }
        if n > 0 {
            self.persist_quiet();
        }
        n
    }

    // -- occurrences ------------------------------------------------------------

    /// Record one firing of the trigger (`AUTOMATION.md` §4: every trigger
    /// produces an Occurrence before any Work exists; the Event Log owns the
    /// run itself, **I3**). Advances next-run (so a due job is never
    /// re-queued mid-flight — trigger dedupe) and feeds the rolling-hour
    /// admission window. The host calls this after the run attempt,
    /// success or failure — a fired trigger is a fired trigger; retries are
    /// the Work kernel's business (`RECOVERY.md`), never a schedule matter.
    pub fn mark_fired(&mut self, id: &str, now: u64) -> Result<(), String> {
        let job = self
            .jobs
            .get_mut(id)
            .ok_or_else(|| format!("unknown job {id:?}"))?;
        job.last_fired_at = Some(now);
        let cutoff = now.saturating_sub(3600);
        job.recent_fires.retain(|t| *t >= cutoff);
        job.recent_fires.push(now);
        job.next_run_at = compute_next_run(&job.trigger, now, None);
        self.persist_quiet();
        Ok(())
    }

    // -- battery ---------------------------------------------------------------

    pub fn set_battery(&mut self, on_battery: bool) {
        self.on_battery = on_battery;
    }

    pub fn on_battery(&self) -> bool {
        self.on_battery
    }

    // -- due computation --------------------------------------------------------

    /// Jobs due now (cron/interval/window match), respecting trigger-plane
    /// pause, battery suppression and the frequency policy. Returns job ids
    /// ordered by next_run_at.
    pub fn due(&mut self, now: u64) -> Vec<String> {
        let on_battery = self.on_battery;
        let ids: Vec<String> = self.jobs.keys().cloned().collect();
        let mut out = Vec::new();
        for id in ids {
            let Some(job) = self.jobs.get(&id) else {
                continue;
            };
            if !job.enabled || job.paused {
                continue;
            }
            // Battery suppression.
            if on_battery && job.policy.suppress_on_battery {
                continue;
            }
            // Frequency policy (rolling hour) — skip if at/over cap.
            if let Some(cap) = job.policy.max_runs_per_hour {
                let cutoff = now.saturating_sub(3600);
                let in_window = job.recent_fires.iter().filter(|t| **t >= cutoff).count() as u32;
                if in_window >= cap {
                    continue;
                }
            }
            let due = match &job.trigger {
                TriggerSpec::Cron { expr } => match CronExpr::parse(expr) {
                    Ok(c) => job.next_run_at.is_some_and(|nr| nr <= now) && c.matches(now),
                    Err(_) => false,
                },
                TriggerSpec::Interval { .. } | TriggerSpec::Window { .. } => {
                    job.next_run_at.is_some_and(|nr| nr <= now)
                }
                TriggerSpec::Event { .. } | TriggerSpec::Webhook { .. } => false,
            };
            if due {
                out.push(id);
            }
        }
        out.sort_by_key(|id| {
            self.jobs
                .get(id)
                .and_then(|j| j.next_run_at)
                .unwrap_or(u64::MAX)
        });
        out
    }

    // -- event + webhook triggers ----------------------------------------------

    /// Fire an event (Gartner kinds). Matches Event-triggered jobs by kind +
    /// filter + scope, respects the frequency cap, queues immediately.
    pub fn fire_event(&mut self, kind: EventKind, payload: &Value, now: u64) -> Vec<String> {
        let payload_str = payload.to_string();
        let ids: Vec<String> = self.jobs.keys().cloned().collect();
        let mut fired = Vec::new();
        for id in ids {
            let Some(job) = self.jobs.get(&id) else {
                continue;
            };
            if !job.enabled || job.paused {
                continue;
            }
            let TriggerSpec::Event { kind: k, filter } = &job.trigger else {
                continue;
            };
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
                let in_window = job.recent_fires.iter().filter(|t| **t >= cutoff).count() as u32;
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
            let Some(job) = self.jobs.get(&id) else {
                continue;
            };
            if !job.enabled || job.paused {
                continue;
            }
            let TriggerSpec::Webhook { path: p, schema } = &job.trigger else {
                continue;
            };
            if p != path {
                continue;
            }
            // Schema validation: every required key must be present.
            let obj = body
                .as_object()
                .ok_or_else(|| format!("webhook {path}: body must be a JSON object"))?;
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

    // -- nudge sentinels --------------------------------------------------------

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
            by_goal
                .entry(s.goal.as_str())
                .or_default()
                .push(s.unix_secs);
        }
        let mut out = Vec::new();
        for (goal, times) in by_goal {
            let mut hours: Vec<u8> = times.iter().map(|t| ((t % 86_400) / 3600) as u8).collect();
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
        out.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        out
    }

    // -- incidents (P51.32e) ------------------------------------------------------

    /// Record an incident. Returns the new incident id. Incidents start
    /// unacked and require an explicit [`Self::ack_incident`].
    pub fn report_incident(
        &mut self,
        job_id: impl Into<String>,
        kind: impl Into<String>,
        detail: impl Into<String>,
        at_ms: u64,
    ) -> String {
        self.incident_seq = self.incident_seq.saturating_add(1);
        let id = format!("inc-{}", self.incident_seq);
        self.incidents.push(Incident {
            id: id.clone(),
            job_id: job_id.into(),
            at_ms,
            kind: kind.into(),
            detail: detail.into(),
            acked: false,
        });
        id
    }

    /// Explicitly acknowledge an incident. Returns `false` for unknown ids.
    pub fn ack_incident(&mut self, id: &str) -> bool {
        if let Some(inc) = self.incidents.iter_mut().find(|i| i.id == id) {
            inc.acked = true;
            true
        } else {
            false
        }
    }

    pub fn get_incident(&self, id: &str) -> Option<&Incident> {
        self.incidents.iter().find(|i| i.id == id)
    }

    /// Cloned incident list (ordered by report time).
    pub fn list_incidents(&self) -> Vec<Incident> {
        self.incidents.clone()
    }

    // -- doctor (P51.32f) ----------------------------------------------------------

    /// Pure read-only health check of the **trigger plane**: `missed_runs`
    /// (enabled, unpaused schedule jobs whose `next_run_at` lies in the past —
    /// the misfire surface) and `queue_depth` (registry size guard). Never
    /// mutates; run-level health belongs to the Work kernel / Event Log.
    pub fn cron_doctor(&self, now: u64) -> Vec<CronCheck> {
        let mut missed = 0usize;
        for job in self.jobs.values() {
            if !job.enabled || job.paused {
                continue;
            }
            if matches!(
                job.trigger,
                TriggerSpec::Event { .. } | TriggerSpec::Webhook { .. }
            ) {
                continue; // event-driven jobs have no next_run_at
            }
            if let Some(t) = job.next_run_at {
                if t < now {
                    missed += 1;
                }
            }
        }
        let depth = self.jobs.len();
        vec![
            CronCheck {
                name: "missed_runs".to_string(),
                ok: missed == 0,
                detail: if missed == 0 {
                    "none".to_string()
                } else {
                    format!("{missed} missed")
                },
            },
            CronCheck {
                name: "queue_depth".to_string(),
                ok: depth <= REGISTRY_SOFT_CAP,
                detail: format!("depth={depth}"),
            },
        ]
    }

    // -- JSON-RPC dispatch ------------------------------------------------------

    pub fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        let out = self.handle_inner(method, params)?;
        // P50.3.3 — the coordinator drives due/fire/mark_fired/monitor through
        // this funnel; write through after every successful mutation so a
        // shell/coordinator restart preserves the trigger registry.
        self.persist_quiet();
        Ok(out)
    }

    fn handle_inner(&mut self, method: &str, params: &Value) -> Result<Value, String> {
        let now = params
            .get("now")
            .and_then(Value::as_u64)
            .unwrap_or_else(|| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0)
            });
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
                    params
                        .get("trigger")
                        .cloned()
                        .ok_or("scheduler/upsert requires trigger")?,
                )
                .map_err(|e| format!("bad trigger: {e}"))?;
                let steps = serde_json::from_value::<Vec<AutomationStep>>(
                    params.get("steps").cloned().unwrap_or(Value::Array(vec![])),
                )
                .map_err(|e| format!("bad steps: {e}"))?;
                let policy = params
                    .get("policy")
                    .cloned()
                    .map(|v| {
                        serde_json::from_value::<SchedulePolicy>(v)
                            .map_err(|e| format!("bad policy: {e}"))
                    })
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
                let enabled = params
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(true);
                self.set_enabled(id, enabled, now)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/pause" => {
                let id = str_param(params, "id").ok_or("scheduler/pause requires id")?;
                self.pause(id)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/pause_session" => {
                let session_id = str_param(params, "sessionId")
                    .ok_or("scheduler/pause_session requires sessionId")?;
                let paused = self.pause_session(session_id);
                Ok(json!({ "ok": true, "paused": paused }))
            }
            "scheduler/resume" => {
                let id = str_param(params, "id").ok_or("scheduler/resume requires id")?;
                self.resume(id, now)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/due" => Ok(json!({ "due": self.due(now), "now": now })),
            "scheduler/mark_fired" => {
                let id = str_param(params, "id").ok_or("scheduler/mark_fired requires id")?;
                self.mark_fired(id, now)?;
                Ok(json!({ "ok": true }))
            }
            "scheduler/battery" => {
                let on = params
                    .get("onBattery")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.set_battery(on);
                Ok(json!({ "ok": true, "onBattery": on }))
            }
            "scheduler/fire_event" => {
                let kind = serde_json::from_value::<EventKind>(
                    params
                        .get("kind")
                        .cloned()
                        .ok_or("scheduler/fire_event requires kind")?,
                )
                .map_err(|e| format!("bad kind: {e}"))?;
                let payload = params.get("payload").cloned().unwrap_or(Value::Null);
                Ok(json!({ "fired": self.fire_event(kind, &payload, now) }))
            }
            "scheduler/fire_webhook" => {
                let path =
                    str_param(params, "path").ok_or("scheduler/fire_webhook requires path")?;
                let body = params.get("body").cloned().unwrap_or(Value::Null);
                let token = params.get("token").and_then(Value::as_str);
                let fired = self.fire_webhook(path, &body, now, token)?;
                Ok(json!({ "fired": fired }))
            }
            "scheduler/webhook_token" => {
                let token = params
                    .get("token")
                    .and_then(Value::as_str)
                    .map(str::to_string);
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
                let job = self
                    .jobs
                    .get_mut(id)
                    .ok_or_else(|| format!("unknown job {id:?}"))?;
                job.next_run_at = Some(now);
                Ok(json!({ "ok": true, "id": id }))
            }
            "scheduler/monitor" => {
                let id = str_param(params, "id").ok_or("scheduler/monitor requires id")?;
                let observation = str_param(params, "observation").unwrap_or("");
                let condition_met = params
                    .get("conditionMet")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let verdict = self.monitor_evaluate(id, observation, condition_met)?;
                Ok(serde_json::to_value(verdict).unwrap_or(Value::Null))
            }
            "scheduler/monitor_config" => {
                let id = str_param(params, "id").ok_or("scheduler/monitor_config requires id")?;
                let monitor = params
                    .get("monitor")
                    .cloned()
                    .map(|v| {
                        serde_json::from_value::<MonitorConfig>(v)
                            .map_err(|e| format!("bad monitor: {e}"))
                    })
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
        TriggerSpec::Window {
            window,
            utc_offset_minutes,
        } => Some(next_window_unix(now, *window, *utc_offset_minutes)),
        TriggerSpec::Event { .. } | TriggerSpec::Webhook { .. } => None,
    }
}

/// Next daily fire at the window's start hour in the given UTC offset.
pub fn next_window_unix(now: u64, window: DayWindow, utc_offset_minutes: i32) -> u64 {
    let offset = (utc_offset_minutes as i64).saturating_mul(60);
    let local = now as i64 + offset;
    let local = if local < 0 { 0 } else { local as u64 };
    let day = local / 86_400;
    let start_today = day * 86_400 + u64::from(window.start_hour()) * 3600;
    let start_local = if local < start_today {
        start_today
    } else {
        start_today + 86_400
    };
    let utc = start_local as i64 - offset;
    if utc < 0 {
        0
    } else {
        utc as u64
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
            "j1",
            "probe",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
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
            "j1",
            "hourly",
            "s1",
            TriggerSpec::Cron {
                expr: "0 16 * * *".into(),
            },
            vec![],
            None,
            now(),
        );
        // 16:00 today (now() is 15:06) — day_start + 16h.
        let day_start = now() - (now() % 86_400);
        let due_at = day_start + 16 * 3600;
        assert!(svc.due(due_at - 60).is_empty());
        assert_eq!(svc.due(due_at), vec!["j1".to_string()]);
    }

    /// The trigger-plane dedupe: a due job stays due until the host records
    /// the firing (`mark_fired`), which advances next-run — so one firing is
    /// never re-queued mid-flight, and the next fire is the next occurrence.
    #[test]
    fn mark_fired_advances_schedule_and_dedupes() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "tick",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        // Due at now+61 and *stays* due every tick until the host marks it.
        assert_eq!(svc.due(now() + 61), vec!["j1".to_string()]);
        assert_eq!(svc.due(now() + 62), vec!["j1".to_string()]);
        svc.mark_fired("j1", now() + 62).unwrap();
        assert!(svc.due(now() + 62).is_empty(), "marked → deduped");
        assert!(svc.due(now() + 100).is_empty(), "next occurrence not yet");
        assert_eq!(svc.due(now() + 123), vec!["j1".to_string()]);
        let job = svc.get("j1").unwrap();
        assert_eq!(job.last_fired_at, Some(now() + 62));
        assert_eq!(job.recent_fires, vec![now() + 62]);
        // Event triggers wait on their event again after a firing.
        svc.upsert(
            "j2",
            "ev",
            "s1",
            TriggerSpec::Event {
                kind: EventKind::RepoChange,
                filter: String::new(),
            },
            vec![],
            None,
            now(),
        );
        svc.fire_event(EventKind::RepoChange, &json!({}), now())
            .first()
            .unwrap();
        svc.mark_fired("j2", now()).unwrap();
        assert!(svc.get("j2").unwrap().next_run_at.is_none());
    }

    #[test]
    fn battery_suppression_skips_jobs() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "bat",
            "s1",
            TriggerSpec::Interval { secs: 5 },
            vec![],
            None,
            now(),
        );
        svc.set_battery(true);
        // Interval job is due (now + 5 passed) but suppressed on battery.
        assert!(svc.due(now() + 10).is_empty());
        svc.set_battery(false);
        assert_eq!(svc.due(now() + 10), vec!["j1".to_string()]);
        // A job that opted out runs on battery.
        let mut svc2 = SchedulerService::new();
        svc2.upsert(
            "j2",
            "always",
            "s1",
            TriggerSpec::Interval { secs: 5 },
            vec![],
            None,
            now(),
        );
        svc2.jobs.get_mut("j2").unwrap().policy.suppress_on_battery = false;
        svc2.set_battery(true);
        assert_eq!(svc2.due(now() + 10), vec!["j2".to_string()]);
    }

    #[test]
    fn event_fire_matches_kind_filter_scope() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "ci",
            "s1",
            TriggerSpec::Event {
                kind: EventKind::CiBuildFail,
                filter: "repo-a".into(),
            },
            vec![],
            None,
            now(),
        );
        svc.upsert(
            "j2",
            "other",
            "s1",
            TriggerSpec::Event {
                kind: EventKind::TestRegression,
                filter: "".into(),
            },
            vec![],
            None,
            now(),
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
            "j3",
            "scoped",
            "s1",
            TriggerSpec::Event {
                kind: EventKind::RepoChange,
                filter: "".into(),
            },
            vec![],
            None,
            now(),
        );
        svc.jobs.get_mut("j3").unwrap().policy.scope = Some("src/".into());
        let fired3 = svc.fire_event(
            EventKind::RepoChange,
            &json!({ "path": "README.md" }),
            now(),
        );
        assert!(fired3.is_empty());
        let fired4 = svc.fire_event(
            EventKind::RepoChange,
            &json!({ "path": "src/main.rs" }),
            now(),
        );
        assert_eq!(fired4, vec!["j3".to_string()]);
    }

    #[test]
    fn webhook_validates_schema_and_token() {
        let mut svc = SchedulerService::new();
        svc.set_webhook_token(Some("tok".into()));
        svc.upsert(
            "w1",
            "hook",
            "s1",
            TriggerSpec::Webhook {
                path: "/hooks/ci".into(),
                schema: vec!["ref".into(), "sha".into()],
            },
            vec![],
            None,
            now(),
        );
        // Bad token → error.
        assert!(svc
            .fire_webhook(
                "/hooks/ci",
                &json!({"ref":"main","sha":"x"}),
                now(),
                Some("nope")
            )
            .is_err());
        // Missing key → error.
        assert!(svc
            .fire_webhook("/hooks/ci", &json!({"ref":"main"}), now(), Some("tok"))
            .is_err());
        // Good → fires.
        let fired = svc
            .fire_webhook(
                "/hooks/ci",
                &json!({"ref":"main","sha":"abc"}),
                now(),
                Some("tok"),
            )
            .unwrap();
        assert_eq!(fired, vec!["w1".to_string()]);
        // Wrong path → nothing.
        let fired2 = svc
            .fire_webhook(
                "/hooks/nope",
                &json!({"ref":"main","sha":"x"}),
                now(),
                Some("tok"),
            )
            .unwrap();
        assert!(fired2.is_empty());
    }

    /// Frequency admission counts *firings* (`mark_fired`), not intent.
    #[test]
    fn frequency_policy_caps_fires() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "noisy",
            "s1",
            TriggerSpec::Event {
                kind: EventKind::TelemetryThreshold,
                filter: "".into(),
            },
            vec![],
            None,
            now(),
        );
        svc.jobs.get_mut("j1").unwrap().policy.max_runs_per_hour = Some(2);
        assert_eq!(
            svc.fire_event(EventKind::TelemetryThreshold, &json!({}), now())
                .len(),
            1
        );
        svc.mark_fired("j1", now()).unwrap();
        assert_eq!(
            svc.fire_event(EventKind::TelemetryThreshold, &json!({}), now())
                .len(),
            1
        );
        svc.mark_fired("j1", now()).unwrap();
        // At cap → suppressed.
        assert!(svc
            .fire_event(EventKind::TelemetryThreshold, &json!({}), now())
            .is_empty());
        // After the hour window → allowed again.
        let later = now() + 3700;
        assert_eq!(
            svc.fire_event(EventKind::TelemetryThreshold, &json!({}), later)
                .len(),
            1
        );
    }

    /// HITL pause on the trigger plane: a flag that stops firing, plus the
    /// chat-delete cascade. (Execution-level waiting is Work's `WaitCondition`.)
    #[test]
    fn pause_is_a_trigger_plane_flag() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "review",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        svc.pause("j1").unwrap();
        assert!(svc.get("j1").unwrap().paused);
        // Paused jobs are not due.
        assert!(svc.due(now() + 61).is_empty());
        svc.resume("j1", now()).unwrap();
        assert!(!svc.get("j1").unwrap().paused);
        assert_eq!(svc.due(now() + 61), vec!["j1".to_string()]);
        // Resume of an event job does not invent a schedule.
        svc.upsert(
            "j2",
            "ev",
            "s1",
            TriggerSpec::Event {
                kind: EventKind::CiBuildFail,
                filter: String::new(),
            },
            vec![],
            None,
            now(),
        );
        svc.pause("j2").unwrap();
        svc.resume("j2", now()).unwrap();
        assert!(svc.get("j2").unwrap().next_run_at.is_none());
    }

    #[test]
    fn nudge_sentinels_suggest_schedule_after_3_days() {
        let mut svc = SchedulerService::new();
        // Same goal, same hour (09:00), 3 distinct days.
        for day in 0..3u64 {
            svc.record_nudge(
                "Morning brief",
                now() + day * 86_400 - now() % 86_400 + 9 * 3600,
            );
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
        let list = svc
            .handle("scheduler/list", &json!({ "now": now() }))
            .unwrap();
        assert_eq!(list["jobs"].as_array().unwrap().len(), 1);
        // run_now forces a due.
        svc.handle("scheduler/run_now", &json!({ "id": "j1", "now": now() }))
            .unwrap();
        let due = svc
            .handle("scheduler/due", &json!({ "now": now() }))
            .unwrap();
        assert_eq!(due["due"], json!(["j1"]));
        // The host records the firing through the funnel.
        svc.handle("scheduler/mark_fired", &json!({ "id": "j1", "now": now() }))
            .unwrap();
        let due2 = svc
            .handle("scheduler/due", &json!({ "now": now() }))
            .unwrap();
        assert!(due2["due"].as_array().unwrap().is_empty());
        // enable/disable.
        svc.handle(
            "scheduler/enable",
            &json!({ "id": "j1", "enabled": false, "now": now() }),
        )
        .unwrap();
        let due3 = svc
            .handle("scheduler/due", &json!({ "now": now() + 120 }))
            .unwrap();
        assert!(due3["due"].as_array().unwrap().is_empty());
        // battery.
        svc.handle("scheduler/battery", &json!({ "onBattery": true }))
            .unwrap();
        assert!(svc.on_battery());
        // Pause/resume through the funnel.
        svc.handle("scheduler/pause", &json!({ "id": "j1" }))
            .unwrap();
        svc.handle("scheduler/resume", &json!({ "id": "j1", "now": now() }))
            .unwrap();
    }

    #[test]
    fn unknown_job_methods_error() {
        let mut svc = SchedulerService::new();
        assert!(svc
            .handle("scheduler/pause", &json!({ "id": "ghost" }))
            .is_err());
        assert!(svc
            .handle("scheduler/mark_fired", &json!({ "id": "ghost" }))
            .is_err());
        assert!(svc.handle("scheduler/nope", &json!({})).is_err());
    }

    #[test]
    fn monitor_notifies_on_first_run_and_stores_observation() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "m1",
            "watch",
            "s1",
            TriggerSpec::Interval { secs: 3600 },
            vec![],
            None,
            now(),
        );
        let v = svc.monitor_evaluate("m1", "price=100", false).unwrap();
        assert!(v.notified, "first run always notifies (baseline)");
        assert!(v.changed, "no previous observation → changed");
        assert!(!v.stopped);
        assert_eq!(v.previous, None);
        assert_eq!(v.current, "price=100");
        assert_eq!(v.notifications, 1);
        assert_eq!(
            svc.get("m1")
                .unwrap()
                .monitor
                .as_ref()
                .unwrap()
                .last_observation
                .as_deref(),
            Some("price=100"),
            "the observation is remembered for the next run (stateful polling)"
        );
    }

    #[test]
    fn monitor_suppresses_unchanged_runs() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "m1",
            "watch",
            "s1",
            TriggerSpec::Interval { secs: 3600 },
            vec![],
            None,
            now(),
        );
        svc.monitor_evaluate("m1", "price=100", false).unwrap();
        let v = svc.monitor_evaluate("m1", "price=100", false).unwrap();
        assert!(!v.changed);
        assert!(
            !v.notified,
            "no delta → no notification (the run vs notify split)"
        );
        assert_eq!(
            v.notifications, 1,
            "an unchanged run does not bump the count"
        );
    }

    #[test]
    fn monitor_notifies_on_delta() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "m1",
            "watch",
            "s1",
            TriggerSpec::Interval { secs: 3600 },
            vec![],
            None,
            now(),
        );
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
        svc.upsert(
            "m1",
            "watch",
            "s1",
            TriggerSpec::Interval { secs: 3600 },
            vec![],
            None,
            now(),
        );
        svc.set_monitor(
            "m1",
            Some(MonitorConfig {
                stop_on_condition: true,
                ..MonitorConfig::default()
            }),
        )
        .unwrap();
        svc.monitor_evaluate("m1", "shipped=false", false).unwrap();
        let v = svc.monitor_evaluate("m1", "delivered", true).unwrap();
        assert!(v.stopped, "condition met + stop_on_condition → stopped");
        assert!(v.notified, "the stop event is worth reporting");
        let job = svc.get("m1").unwrap();
        assert!(!job.enabled, "a stopped monitor is disabled");
    }

    #[test]
    fn job_serializes_camel_case_for_the_sidecar() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "brief",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        let list = svc
            .handle("scheduler/list", &json!({ "now": now() }))
            .unwrap();
        let job = &list["jobs"][0];
        assert_eq!(
            job["sessionId"], "s1",
            "session_id must serialize as sessionId for the coordinator: {job}"
        );
        assert!(
            job.get("session_id").is_none(),
            "no snake_case leakage: {job}"
        );
        assert!(
            job["policy"]["suppressOnBattery"].as_bool().is_some(),
            "policy is camelCase: {}",
            job["policy"]
        );
        assert!(job["policy"].get("suppress_on_battery").is_none());

        // Trigger-plane shape: a pause flag, no execution state at all —
        // no `state` machine, no leases/fences/checkpoints/run snapshots.
        assert_eq!(job["paused"], json!(false));
        for gone in [
            "state",
            "checkpoint",
            "currentRun",
            "runs",
            "successes",
            "failures",
            "modelPin",
            "effortPin",
            "manifestHash",
            "lastOutput",
        ] {
            assert!(
                job.get(gone).is_none(),
                "execution state {gone:?} must not exist on the trigger plane: {job}"
            );
        }
    }

    /// The structural **I26/I3** assertion: the wire shape itself carries no
    /// run state machine — a trigger plane, not a second executor.
    #[test]
    fn trigger_plane_wire_has_no_execution_state() {
        let svc = SchedulerService::new();
        let _ = svc; // the assertion above is the structural check; keep both named
    }

    #[test]
    fn window_trigger_fires_at_named_hour() {
        // 09:30 UTC — morning (06:00) already passed, next morning is tomorrow 06:00.
        let t = sun_0930();
        let next = next_window_unix(t, DayWindow::Morning, 0);
        assert!(next > t);
        let (_min, hour, ..) = civil_parts(next);
        assert_eq!(hour, 6);
        // Afternoon 12:00 is still ahead today.
        let aft = next_window_unix(t, DayWindow::Afternoon, 0);
        let (_m, h, ..) = civil_parts(aft);
        assert_eq!(h, 12);
        assert!(aft > t);
        let mut svc = SchedulerService::new();
        svc.upsert(
            "w1",
            "brief",
            "s1",
            TriggerSpec::Window {
                window: DayWindow::Afternoon,
                utc_offset_minutes: 0,
            },
            vec![],
            None,
            t,
        );
        assert_eq!(svc.get("w1").unwrap().next_run_at, Some(aft));
    }

    #[test]
    fn pause_session_cascades_to_session_jobs() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "a",
            "a",
            "chat-1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        svc.upsert(
            "b",
            "b",
            "chat-1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        svc.upsert(
            "c",
            "c",
            "other",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        let n = svc.pause_session("chat-1");
        assert_eq!(n, 2);
        assert!(svc.get("a").unwrap().paused);
        assert!(!svc.get("c").unwrap().paused);
        let out = svc
            .handle("scheduler/pause_session", &json!({ "sessionId": "chat-1" }))
            .unwrap();
        assert_eq!(out["paused"], 0, "already paused — no double count");
    }

    /// P50.3.3 — the trigger registry survives a shell/coordinator restart,
    /// and recovery is misfire-policy-by-construction: a job whose schedule
    /// slipped past fires once on resume (`run_once_on_resume`), then
    /// `mark_fired` advances it — never a replay of every missed occurrence.
    #[test]
    fn jobs_survive_restart_and_recover_run_once_on_resume() {
        let dir = std::env::temp_dir().join(format!("everyaios-schedsvc-{}", std::process::id()));
        let path = dir.join("scheduler.json");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");

        {
            let mut svc = SchedulerService::load_or_new(path.clone());
            svc.upsert(
                "j-done",
                "idle job",
                "s1",
                TriggerSpec::Interval { secs: 60 },
                vec![],
                None,
                now(),
            );
            svc.upsert(
                "j-slip",
                "slipped job",
                "s1",
                TriggerSpec::Interval { secs: 60 },
                vec![],
                None,
                now(),
            );
            svc.mark_fired("j-slip", now()).unwrap();
        }
        {
            let mut svc = SchedulerService::load_or_new(path.clone());
            assert_eq!(svc.list().len(), 2, "both jobs survive the restart");
            let done = svc.get("j-done").unwrap();
            assert!(done.enabled, "enabled flag survives");
            assert!(!done.paused);
            // A job that fired before the restart kept its occurrence record…
            let slipped = svc.get("j-slip").unwrap();
            assert_eq!(slipped.last_fired_at, Some(now()));
            // …so it is not due again until its next occurrence.
            assert!(
                svc.due(now() + 30).is_empty(),
                "both jobs' next fire is now+60"
            );
            // Both jobs' next occurrence is now+60 — both fire once, then
            // mark_fired advances each. No replay of every missed occurrence.
            // (Order: both share next_run_at → registry insertion order.)
            let both = svc.due(now() + 61);
            assert!(both.contains(&"j-done".to_string()) && both.contains(&"j-slip".to_string()));
            svc.mark_fired("j-done", now() + 61).unwrap();
            assert_eq!(
                svc.due(now() + 61),
                vec!["j-slip".to_string()],
                "marked job deduped; the unmarked one stays due"
            );
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    // -- P51.32a continuity ------------------------------------------------------

    #[test]
    fn notepad_roundtrips_and_ignores_unknown_jobs() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "brief",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        assert!(svc.append_notepad("j1", "line one"));
        assert!(svc.append_notepad("j1", "line two"));
        assert_eq!(
            svc.notepad("j1").as_deref(),
            Some("line one\nline two"),
            "notepad survives into the next run"
        );
        assert!(svc.notepad("ghost").is_none());
        assert!(!svc.append_notepad("ghost", "x"));
    }

    // -- P51.32b monitor-script mode ----------------------------------------------

    #[test]
    fn script_empty_is_silent() {
        let cfg = MonitorConfig {
            source: MonitorSource::Script {
                cmd: "check.sh".into(),
                allow_net: false,
            },
            ..MonitorConfig::default()
        };
        let silent = cfg.evaluate_script("", true);
        assert!(!silent.notified, "empty + silent_on_empty → not notified");
        assert_eq!(silent.current, "");
        let baseline = cfg.evaluate_script("", false);
        assert!(
            baseline.notified,
            "empty without the silent flag still notifies the baseline"
        );
    }

    #[test]
    fn script_stdout_verbatim_no_trim() {
        let cfg = MonitorConfig::default();
        let out = "  padded  \nline2  ";
        let v = cfg.evaluate_script(out, false);
        assert_eq!(v.current, out, "stdout stored verbatim, no trim");
        // Stateful path also stores verbatim and dedupes identical polls.
        let mut svc = SchedulerService::new();
        svc.upsert(
            "m1",
            "watch",
            "s1",
            TriggerSpec::Interval { secs: 3600 },
            vec![],
            None,
            now(),
        );
        let v1 = svc.monitor_evaluate_script("m1", out, false).unwrap();
        assert_eq!(v1.current, out);
        assert!(v1.notified, "first script observation notifies");
        let v2 = svc.monitor_evaluate_script("m1", out, false).unwrap();
        assert!(!v2.changed, "identical stdout → unchanged");
        assert!(!v2.notified, "identical stdout → no second notification");
        assert_eq!(
            svc.get("m1")
                .unwrap()
                .monitor
                .as_ref()
                .unwrap()
                .last_observation
                .as_deref(),
            Some(out)
        );
    }

    // -- P51.32e incidents -----------------------------------------------------------

    #[test]
    fn incidents_require_explicit_ack() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "j1",
            "fragile",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        let id = svc.report_incident("j1", "run_failed", "boom", now());
        let list = svc.list_incidents();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].job_id, "j1");
        assert!(!list[0].acked, "incidents start unacked");
        assert!(!svc.ack_incident("inc-nope"), "unknown id → false");
        // Still unacked until the explicit ack.
        assert!(!svc.list_incidents()[0].acked);
        assert!(svc.ack_incident(&id));
        assert!(svc.list_incidents()[0].acked, "explicit ack flips the flag");
        assert_eq!(svc.get_incident(&id).unwrap().detail, "boom");
    }

    // -- P51.32f doctor -----------------------------------------------------------------

    #[test]
    fn cron_doctor_flags_missed_runs() {
        let mut svc = SchedulerService::new();
        svc.upsert(
            "missed",
            "m",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        svc.jobs.get_mut("missed").unwrap().next_run_at = Some(now() - 1000);
        svc.upsert(
            "fresh",
            "f",
            "s1",
            TriggerSpec::Interval { secs: 60 },
            vec![],
            None,
            now(),
        );
        // Event jobs have no schedule to miss.
        svc.upsert(
            "ev",
            "e",
            "s1",
            TriggerSpec::Event {
                kind: EventKind::RepoChange,
                filter: String::new(),
            },
            vec![],
            None,
            now(),
        );
        let checks = svc.cron_doctor(now());
        let missed = checks.iter().find(|c| c.name == "missed_runs").unwrap();
        let queue = checks.iter().find(|c| c.name == "queue_depth").unwrap();
        assert!(!missed.ok, "overdue next_run_at flags: {}", missed.detail);
        assert!(queue.ok, "small registry is healthy: {}", queue.detail);
        // Healthy service → all green.
        let fresh = SchedulerService::new();
        assert!(fresh.cron_doctor(now()).iter().all(|c| c.ok));
    }
}
