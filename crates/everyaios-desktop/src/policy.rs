//! Guard-2 for desktop computer-use (E9): app allow-list, a confirmation
//! taxonomy (delete / money / install / CAPTCHA / transmit), hard denies
//! (Terminal, Run, Win-key, lock screen, UAC, password managers, EveryAIOS's
//! own UI), a kill switch, per-minute rate limiting, safe zones (taskbar /
//! notification area), and a Merkle-audit sink.
//!
//! The human gate itself (`PermissionGate`) is a seam: the desktop host backs
//! it with `everyaios-guard::TicketStore` (mint → approve → use) so every
//! effect rides the same dual-guard as every other effect in the product.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::types::{ActKind, Region};

/// What an action touches, classified for the confirmation card.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ConfirmClass {
    /// Destructive / data-loss (delete, overwrite, format…).
    Delete,
    /// Financial effect (pay, buy, send money, order…).
    Money,
    /// Installs software or makes system-level changes (install, uninstall, elevate…).
    Install,
    /// Anti-bot challenge (CAPTCHA) — always human.
    Captcha,
    /// Transmits data off-machine (send, upload, share, email…).
    Transmit,
    /// Ordinary navigation / read / benign click.
    Routine,
}

impl ConfirmClass {
    /// Keyword classification for a click target or key (deterministic).
    pub fn classify(target: &str, key: Option<&str>) -> ConfirmClass {
        let t = target.to_ascii_lowercase();
        let k = key.map(|s| s.to_ascii_lowercase()).unwrap_or_default();
        let hay = format!("{t} {k}");
        // Hard safety first: nothing below can override these.
        if [
            "delete",
            "remove",
            "uninstall",
            "format",
            "erase",
            "overwrite",
            "trash",
            "purge",
        ]
        .iter()
        .any(|w| hay.contains(w))
        {
            return ConfirmClass::Delete;
        }
        if [
            "buy",
            "purchase",
            "checkout",
            "pay",
            "payment",
            "transfer",
            "send money",
            "$",
            "price",
            "checkout",
        ]
        .iter()
        .any(|w| hay.contains(w))
        {
            return ConfirmClass::Money;
        }
        if [
            "install", "setup", "update", "upgrade", "elevate", "sudo", "admin",
        ]
        .iter()
        .any(|w| hay.contains(w))
        {
            return ConfirmClass::Install;
        }
        if [
            "captcha",
            "verify you are human",
            "i am not a robot",
            "challenge",
        ]
        .iter()
        .any(|w| hay.contains(w))
        {
            return ConfirmClass::Captcha;
        }
        if [
            "send", "submit", "post", "upload", "share", "email", "publish", "transfer", "export",
        ]
        .iter()
        .any(|w| hay.contains(w))
        {
            return ConfirmClass::Transmit;
        }
        ConfirmClass::Routine
    }
}

/// Patterns that are NEVER automated — hard denies regardless of allow-list.
const HARD_DENY_APP: &[&str] = &[
    "terminal",
    "windows terminal",
    "command prompt",
    "powershell",
    "run",
    "uac",
    "user account control",
    "password manager",
    "keepass",
    "bitwarden",
    "1password",
    "lastpass",
    "lock screen",
    "sign in",
    "login",
];
/// EveryAIOS's own UI is never driven by the agent (no self-puppetry).
const EVERYAIOS_APP_NAMES: &[&str] = &["everyaios", "everyaios desktop"];

/// Keys that are never synthesised (Win-key, lock, UAC combos…).
const HARD_DENY_KEY: &[&str] = &[
    "super",
    "super_l",
    "super_r",
    "win",
    "ctrl+alt+del",
    "lock",
    "print",
];

/// Confirm classes that always need a human before execution.
const ALWAYS_CONFIRM: &[ConfirmClass] = &[
    ConfirmClass::Delete,
    ConfirmClass::Money,
    ConfirmClass::Install,
    ConfirmClass::Captcha,
    ConfirmClass::Transmit,
];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum GateDecision {
    /// Allow without a human (allow-listed + routine).
    Allow,
    /// Needs a human confirmation card.
    Confirm(ConfirmClass),
    /// Permanently denied by policy (hard deny / off allow-list in strict mode).
    Deny,
}

impl GateDecision {
    pub fn as_str(&self) -> &'static str {
        match self {
            GateDecision::Allow => "allow",
            GateDecision::Confirm(_) => "confirm",
            GateDecision::Deny => "deny",
        }
    }
}

/// The human-in-the-loop gate — host wires this to the TicketStore.
pub trait PermissionGate: Send + Sync {
    /// Ask for approval of a classified action. `expected_confirmation` must
    /// match the class the caller was told to confirm.
    fn request(&self, act: &ActKind, class: ConfirmClass) -> GateDecision;
}

/// A gate that approves nothing — fail-closed default.
pub struct DenyAllGate;
impl PermissionGate for DenyAllGate {
    fn request(&self, _act: &ActKind, _class: ConfirmClass) -> GateDecision {
        GateDecision::Deny
    }
}

/// An audit sink — the host backs it with `everyaios-audit::AuditWriter`
/// (Merkle chain); a no-op sink exists for tests/unsupervised use.
pub trait AuditSink: Send + Sync {
    fn write(&self, kind: &str, payload: serde_json::Value);
}

/// No-op audit (tests only — production must pass a real sink).
pub struct NoopSink;
impl AuditSink for NoopSink {
    fn write(&self, _kind: &str, _payload: serde_json::Value) {}
}

/// App allow-list: default-deny for unlisted apps in strict mode; in standard
/// mode unlisted apps are Confirm(Routine) — never silently allowed.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppPolicy {
    /// Allowed app names / process names (case-insensitive).
    pub allow_list: Vec<String>,
    /// strict = unlisted apps are Deny; standard = unlisted are Confirm(Routine).
    pub strict: bool,
    /// Custom safe zones (screen rects never acted on), e.g. the taskbar.
    pub safe_zones: Vec<Region>,
}

impl AppPolicy {
    pub fn allow(mut self, app: impl Into<String>) -> Self {
        self.allow_list.push(app.into().to_ascii_lowercase());
        self
    }

    pub fn with_safe_zone(mut self, zone: Region) -> Self {
        self.safe_zones.push(zone);
        self
    }

    fn is_allow_listed(&self, app: &str) -> bool {
        let app = app.to_ascii_lowercase();
        self.allow_list.iter().any(|a| {
            let a = a.to_ascii_lowercase();
            app.contains(&a) || a.contains(&app)
        })
    }

    /// Hard-deny check: never automate terminal/run/password-managers/UAC/
    /// lock screen / EveryAIOS itself, regardless of the allow-list.
    pub fn hard_deny(app: &str, key: Option<&str>) -> Option<String> {
        let app = app.to_ascii_lowercase();
        if HARD_DENY_APP.iter().any(|h| app.contains(h)) {
            return Some(format!("app \"{app}\" is on the hard-deny list"));
        }
        if EVERYAIOS_APP_NAMES.iter().any(|e| app.contains(e)) {
            return Some("EveryAIOS's own UI is never driven by the agent".into());
        }
        if let Some(k) = key {
            let k = k.to_ascii_lowercase();
            if HARD_DENY_KEY.iter().any(|h| k.contains(h)) {
                return Some(format!("key \"{k}\" is on the hard-deny list"));
            }
        }
        None
    }

    /// Classify one action against policy → the gate decision to surface.
    pub fn evaluate(
        &self,
        app: &str,
        act: &ActKind,
        key: Option<&str>,
    ) -> Result<GateDecision, String> {
        if let Some(reason) = Self::hard_deny(app, key) {
            return Err(reason);
        }
        let class = match act {
            ActKind::Click { x, y }
            | ActKind::Scroll { x, y, .. }
            | ActKind::Drag { from: (x, y), .. } => {
                let pt = (*x, *y);
                if self.safe_zones.iter().any(|z| z.contains(pt.0, pt.1)) {
                    return Err("point is inside a safe zone".into());
                }
                ConfirmClass::Routine
            }
            ActKind::ClickByName { name } | ActKind::SetValue { name, .. } => {
                ConfirmClass::classify(name, key)
            }
            ActKind::Type { .. } | ActKind::Press { .. } => ConfirmClass::Routine,
            ActKind::LaunchApp { app: target } => ConfirmClass::classify(target, None),
            ActKind::ActivateWindow { .. } => ConfirmClass::Routine,
        };
        if ALWAYS_CONFIRM.contains(&class) {
            return Ok(GateDecision::Confirm(class));
        }
        if self.is_allow_listed(app) {
            return Ok(GateDecision::Allow);
        }
        if self.strict {
            Ok(GateDecision::Deny)
        } else {
            // Unlisted app, routine action → still confirm (never silent).
            Ok(GateDecision::Confirm(ConfirmClass::Routine))
        }
    }
}

/// Global kill switch — once stopped, every engine op fails closed.
#[derive(Debug, Default)]
pub struct KillSwitch {
    stopped: AtomicBool,
}

impl KillSwitch {
    pub fn new() -> Self {
        Self {
            stopped: AtomicBool::new(false),
        }
    }

    pub fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.stopped.store(false, Ordering::SeqCst);
    }

    pub fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }

    pub fn check(&self) -> Result<(), String> {
        if self.is_stopped() {
            Err("emergency stop engaged — every desktop op fails closed".into())
        } else {
            Ok(())
        }
    }
}

/// Per-minute action rate limit (default 20 actions/min — ChatGPT-class
/// pacing; a runaway loop trips this before it can thrash the desktop).
#[derive(Debug)]
pub struct RateLimiter {
    max_per_minute: u32,
    window: Mutex<Vec<Instant>>,
}

impl RateLimiter {
    pub fn new(max_per_minute: u32) -> Self {
        Self {
            max_per_minute: max_per_minute.max(1),
            window: Mutex::new(Vec::new()),
        }
    }

    /// Returns Ok if the action may proceed; Err with the retry-after when
    /// the budget is exhausted.
    pub fn allow(&self) -> Result<(), Duration> {
        let now = Instant::now();
        let mut w = self.window.lock().unwrap();
        w.retain(|t| now.duration_since(*t) < Duration::from_secs(60));
        if w.len() >= self.max_per_minute as usize {
            let oldest = w.first().copied().unwrap_or(now);
            let retry = Duration::from_secs(60).saturating_sub(now.duration_since(oldest));
            return Err(retry);
        }
        w.push(now);
        Ok(())
    }

    pub fn count(&self) -> usize {
        self.window.lock().unwrap().len()
    }
}

/// The assembled Guard-2 desktop gate.
pub struct DesktopGuard {
    pub policy: AppPolicy,
    pub gate: Box<dyn PermissionGate>,
    pub kill: KillSwitch,
    pub limiter: RateLimiter,
    pub sink: Box<dyn AuditSink>,
}

impl DesktopGuard {
    pub fn new(policy: AppPolicy, gate: Box<dyn PermissionGate>, sink: Box<dyn AuditSink>) -> Self {
        Self {
            policy,
            gate,
            kill: KillSwitch::new(),
            limiter: RateLimiter::new(20),
            sink,
        }
    }

    /// Full pre-action gate: kill switch → rate limit → policy → human gate →
    /// audit. Returns the decision; on Allow the caller executes.
    pub fn preflight(
        &self,
        app: &str,
        act: &ActKind,
        key: Option<&str>,
    ) -> Result<GateDecision, String> {
        self.kill.check()?;
        self.limiter
            .allow()
            .map_err(|retry_after| format!("rate limit: retry in {:?}", retry_after))?;
        let decision = self.policy.evaluate(app, act, key)?;
        let final_decision = match decision {
            GateDecision::Confirm(class) => self.gate.request(act, class),
            other => other,
        };
        self.audit(app, act, &final_decision);
        Ok(final_decision)
    }

    fn audit(&self, app: &str, act: &ActKind, decision: &GateDecision) {
        let payload = serde_json::json!({
            "surface": "desktop",
            "app": app,
            "act": act.describe(),
            "decision": decision.as_str(),
            "class": match decision {
                GateDecision::Confirm(c) => format!("{c:?}"),
                _ => "routine".to_string(),
            },
        });
        self.sink.write("desktop.guard2", payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct AllowGate;
    impl PermissionGate for AllowGate {
        fn request(&self, _act: &ActKind, _class: ConfirmClass) -> GateDecision {
            GateDecision::Allow
        }
    }

    struct ConfirmAllGate;
    impl PermissionGate for ConfirmAllGate {
        fn request(&self, _act: &ActKind, _class: ConfirmClass) -> GateDecision {
            GateDecision::Confirm(_class)
        }
    }

    fn gate_allow() -> DesktopGuard {
        DesktopGuard::new(
            AppPolicy::default().allow("notepad"),
            Box::new(AllowGate),
            Box::new(NoopSink),
        )
    }

    #[test]
    fn taxonomy_classifies_risky_targets() {
        assert_eq!(
            ConfirmClass::classify("Delete file", None),
            ConfirmClass::Delete
        );
        assert_eq!(ConfirmClass::classify("Buy now", None), ConfirmClass::Money);
        assert_eq!(
            ConfirmClass::classify("Install package", None),
            ConfirmClass::Install
        );
        assert_eq!(
            ConfirmClass::classify("I am not a robot", None),
            ConfirmClass::Captcha
        );
        assert_eq!(
            ConfirmClass::classify("Send email", None),
            ConfirmClass::Transmit
        );
        assert_eq!(
            ConfirmClass::classify("Save document", None),
            ConfirmClass::Routine
        );
    }

    #[test]
    fn hard_deny_apps_never_automated() {
        assert!(AppPolicy::hard_deny("Windows Terminal", None).is_some());
        assert!(AppPolicy::hard_deny("1Password", None).is_some());
        assert!(AppPolicy::hard_deny("EveryAIOS", None).is_some());
        assert!(AppPolicy::hard_deny("notepad", None).is_none());
        assert!(AppPolicy::hard_deny("notepad", Some("Super_L")).is_some());
        assert!(AppPolicy::hard_deny("notepad", Some("Enter")).is_none());
    }

    #[test]
    fn allow_listed_routine_is_allow() {
        let g = gate_allow();
        let d = g
            .preflight("notepad", &ActKind::Click { x: 10, y: 10 }, None)
            .unwrap();
        assert_eq!(d, GateDecision::Allow);
    }

    #[test]
    fn risky_action_reaches_the_human_gate_even_when_allow_listed() {
        // The policy classifies Delete as Confirm; the HUMAN gate then decides.
        let g = DesktopGuard::new(
            AppPolicy::default().allow("notepad"),
            Box::new(ConfirmAllGate),
            Box::new(NoopSink),
        );
        let d = g
            .preflight(
                "notepad",
                &ActKind::ClickByName {
                    name: "Delete".into(),
                },
                None,
            )
            .unwrap();
        assert_eq!(d, GateDecision::Confirm(ConfirmClass::Delete));
        // With an approving human gate the same action is allowed (audited).
        let g2 = gate_allow();
        let d2 = g2
            .preflight(
                "notepad",
                &ActKind::ClickByName {
                    name: "Delete".into(),
                },
                None,
            )
            .unwrap();
        assert_eq!(d2, GateDecision::Allow);
    }

    #[test]
    fn unlisted_app_confirms_or_denies_by_mode() {
        // standard: unlisted + routine → Confirm reaches the human gate.
        let g = DesktopGuard::new(
            AppPolicy::default(),
            Box::new(ConfirmAllGate),
            Box::new(NoopSink),
        );
        let d = g
            .preflight("random-app", &ActKind::Click { x: 5, y: 5 }, None)
            .unwrap();
        assert_eq!(d, GateDecision::Confirm(ConfirmClass::Routine));
        // strict: unlisted → Deny before any human gate.
        let strict = DesktopGuard::new(
            AppPolicy {
                strict: true,
                ..AppPolicy::default()
            },
            Box::new(AllowGate),
            Box::new(NoopSink),
        );
        let d = strict
            .preflight("random-app", &ActKind::Click { x: 5, y: 5 }, None)
            .unwrap();
        assert_eq!(d, GateDecision::Deny);
    }

    #[test]
    fn safe_zone_blocks_points() {
        let g = DesktopGuard::new(
            AppPolicy::default()
                .allow("notepad")
                .with_safe_zone(Region {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                }),
            Box::new(AllowGate),
            Box::new(NoopSink),
        );
        let err = g
            .preflight("notepad", &ActKind::Click { x: 50, y: 50 }, None)
            .unwrap_err();
        assert!(err.contains("safe zone"));
    }

    #[test]
    fn kill_switch_fails_closed() {
        let g = gate_allow();
        g.kill.stop();
        assert!(g
            .preflight("notepad", &ActKind::Click { x: 1, y: 1 }, None)
            .is_err());
        g.kill.resume();
        assert!(g
            .preflight("notepad", &ActKind::Click { x: 1, y: 1 }, None)
            .is_ok());
    }

    #[test]
    fn rate_limiter_bounds_actions_per_minute() {
        let l = RateLimiter::new(3);
        for _ in 0..3 {
            assert!(l.allow().is_ok());
        }
        assert!(l.allow().is_err());
        assert_eq!(l.count(), 3);
    }

    #[test]
    fn hard_deny_evaluates_to_error_not_confirm() {
        let g = gate_allow();
        let err = g
            .preflight(
                "Windows Terminal",
                &ActKind::Type {
                    text: "rm -rf /".into(),
                },
                None,
            )
            .unwrap_err();
        assert!(err.contains("hard-deny"));
    }
}
