//! everyaios-desktop — E9 desktop computer-use (required, not a cut).
//!
//! ChatGPT Desktop + Claude Computer Use parity over *native* windows:
//!
//! 1. **See** — per-window capture + region zoom (X11 GetImage live; Win
//!    PrintWindow → screen-DC; macOS `screencapture`). Windows.Graphics.Capture
//!    (occluded capture) is the documented follow-on seam.
//! 2. **Read** — window/app list + UIA tree with indexes + click-by-name
//!    (Windows); EWMH list (X11); macOS window list. Empty tree → OCR.
//! 3. **Act** — UIA Invoke/SetValue first, then SendInput (Windows); XTEST
//!    (X11); System Events (macOS). Observe → **one** action → re-observe.
//! 4. **Vision fallback** — tesseract word boxes + click-coords math.
//! 5. **Verify** — assert/retry/locator cascade, halt-over-guess.
//! 6. **Layer-1 first** — API > CDP browser > desktop GUI routing.
//! 7. **Guard-2** — app allow-list, confirm taxonomy, hard denies, kill
//!    switch, rate limit, safe zones, Merkle audit.
//! 8. **macOS twin** — same surface via Screen Recording + Accessibility.
//!
//! The engine is a library; the desktop host wires the [`policy::PermissionGate`]
//! to `everyaios-guard::TicketStore` and the [`policy::AuditSink`] to
//! `everyaios-audit::AuditWriter` (Merkle chain), exactly like every other
//! effect in the product.

pub mod apps;
pub mod launch;
pub mod ocr;
pub mod platform;
pub mod policy;
pub mod readiness;
pub mod router;
pub mod types;
pub mod verify;

use std::sync::Arc;

use thiserror::Error;

pub use apps::{annotate_inventory, installed_apps, search_apps, AppSource, InstalledApp};
pub use launch::{is_secret_env_name, prepare_child, resolve_target};
pub use ocr::{locate_phrase, OcrEngine, VisionHit};
pub use policy::{
    AppPolicy, ConfirmClass, DesktopGuard, GateDecision, InteractionMode, PermissionGate,
};
pub use readiness::{derive as derive_readiness, Readiness, ReadinessState};
pub use router::{route, Layer, RouteDecision};
pub use types::{
    ActKind, ActOutcome, Capabilities, ReadNode, ReadResult, Region, SeeMethod, SeeResult,
    VerifyOutcome, WindowInfo,
};
pub use verify::{Locator, Observer, Verifier};

/// Every failure mode of the desktop engine.
#[derive(Debug, Error)]
pub enum DesktopError {
    #[error("platform error: {0}")]
    Platform(String),
    #[error("invalid region: {0}")]
    InvalidRegion(String),
    #[error("guard-2: {0}")]
    Guard(String),
    #[error("unsupported: {0}")]
    Unsupported(String),
}

pub type Result<T> = std::result::Result<T, DesktopError>;

/// The full E9 engine: platform backend + Guard-2 + verifier + OCR.
pub struct DesktopEngine {
    backend: platform::PlatformBackend,
    guard: Arc<DesktopGuard>,
    verifier: Verifier,
    ocr: Arc<dyn OcrEngine>,
}

impl DesktopEngine {
    /// Construct the engine for the current platform with the given Guard-2
    /// policy/gate/audit wiring.
    pub fn new(
        policy: AppPolicy,
        gate: Box<dyn PermissionGate>,
        sink: Box<dyn policy::AuditSink>,
    ) -> Result<Self> {
        let backend = platform::PlatformBackend::current()?;
        let ocr: Arc<dyn OcrEngine> = if ocr::TesseractCli::default().available() {
            Arc::new(ocr::TesseractCli::default())
        } else {
            Arc::new(ocr::NoOcr)
        };
        Ok(Self {
            backend,
            guard: Arc::new(DesktopGuard::new(policy, gate, sink)),
            verifier: Verifier::default(),
            ocr,
        })
    }

    /// Construct with a pre-built guard (tests inject their own gate/sink).
    pub fn with_guard(
        backend: platform::PlatformBackend,
        guard: DesktopGuard,
        ocr: Arc<dyn OcrEngine>,
    ) -> Self {
        Self {
            backend,
            guard: Arc::new(guard),
            verifier: Verifier::default(),
            ocr,
        }
    }

    pub fn guard(&self) -> &DesktopGuard {
        &self.guard
    }

    /// P57.8 — the policy the Guard-2 preflight is currently enforcing.
    pub fn policy(&self) -> AppPolicy {
        self.guard.policy()
    }

    /// P57.8 — apply a policy change to the **live** engine (Settings →
    /// Computer use writes an allow-list row or the interaction default and the
    /// next action is gated on it; no restart, no re-attach).
    pub fn set_policy(&self, policy: AppPolicy) {
        self.guard.set_policy(policy);
    }

    /// Honest capability surface for this platform (UI shows this).
    pub fn capabilities(&self) -> Capabilities {
        self.backend.capabilities()
    }

    /// The emergency kill switch (STOP button / estop).
    pub fn emergency_stop(&self) {
        self.guard.kill.stop();
    }

    pub fn resume(&self) {
        self.guard.kill.resume();
    }

    // ---- See ----

    /// Capture a window (or a sub-region — Claude-class region zoom).
    pub fn see(&self, window: &WindowInfo) -> Result<SeeResult> {
        self.see_region(
            window,
            Region::full(window.width.max(1), window.height.max(1)),
        )
    }

    pub fn see_region(&self, window: &WindowInfo, region: Region) -> Result<SeeResult> {
        self.guard.kill.check().map_err(DesktopError::Guard)?;
        self.backend.see(window, region)
    }

    // ---- Read ----

    pub fn list_windows(&self) -> Result<Vec<WindowInfo>> {
        self.guard.kill.check().map_err(DesktopError::Guard)?;
        self.backend.list_windows()
    }

    /// Read a window: a11y tree when the platform exposes one, else None
    /// (the caller then uses the OCR vision fallback).
    pub fn read(&self, window: &WindowInfo) -> Result<ReadResult> {
        self.guard.kill.check().map_err(DesktopError::Guard)?;
        self.backend.read(window)
    }

    // ---- Vision fallback (OCR) ----

    pub fn ocr_window(&self, window: &WindowInfo) -> Result<Vec<types::OcrWord>> {
        let see = self.see(window)?;
        Ok(self.ocr.ocr(&see.png))
    }

    /// Resolve a phrase to a click point via OCR (vision fallback).
    pub fn resolve_by_ocr(&self, window: &WindowInfo, phrase: &str) -> Result<ocr::VisionHit> {
        let words = self.ocr_window(window)?;
        Ok(ocr::locate_phrase(&words, phrase))
    }

    // ---- Act (dual-guarded) ----

    /// Run one action through the full Guard-2 gate; on `Allow` it executes.
    /// Returns the gate decision + the execution outcome.
    pub fn act(&self, window: &WindowInfo, act: &ActKind, key: Option<&str>) -> Result<ActOutcome> {
        let mode = self.guard.policy().interaction_mode;
        // P57.1 — a launch must name one exact, absolute program before any
        // policy or platform work: a relative path would resolve against this
        // process's cwd, so the executed file could differ from the allow-list
        // entry the gate matched.
        if let Some(reason) = crate::launch::validate(act) {
            return Ok(ActOutcome {
                kind: act.clone(),
                ok: false,
                verification: None,
                error: Some(format!("launch refused: {reason}")),
            });
        }
        // P57.3 — the background contract is enforced before the platform call:
        // under the Background default the driver never raises another window,
        // because that is a foreground escalation (P57.4), not a default.
        if matches!(act, ActKind::ActivateWindow { .. })
            && !self.guard.policy().allows_raising_windows()
        {
            return Ok(ActOutcome {
                kind: act.clone(),
                ok: false,
                verification: None,
                error: Some(
                    "background contract: raising another window needs the Foreground \
                     interaction default (Settings → Computer use)"
                        .into(),
                ),
            });
        }
        // P57.2 — the Guard-2 subject is the program being launched, never the
        // window that happens to be focused: allow-listing an app has to gate
        // that app.
        let subject = act.launch_target().unwrap_or(window.app.as_str());
        let decision = self
            .guard
            .preflight(subject, act, key)
            .map_err(DesktopError::Guard)?;
        if decision != GateDecision::Allow {
            return Ok(ActOutcome {
                kind: act.clone(),
                ok: false,
                verification: None,
                error: Some(format!("gate decision: {}", decision.as_str())),
            });
        }
        self.backend.act(window, act, mode)?;
        Ok(ActOutcome {
            kind: act.clone(),
            ok: true,
            verification: None,
            error: None,
        })
    }

    /// Observe → one action → re-observe with a verify cascade. Halts
    /// (never guesses) when the locator is not satisfied.
    pub fn act_with_verify(
        &self,
        window: &WindowInfo,
        act: &ActKind,
        locator: &Locator,
        key: Option<&str>,
    ) -> Result<ActOutcome> {
        let mut outcome = self.act(window, act, key)?;
        if outcome.ok {
            let obs = EngineObserver {
                engine: self,
                window_id: window.id,
            };
            let verdict = self.verifier.verify(window.id, locator, &obs);
            let halted = matches!(&verdict, VerifyOutcome::Halt { .. });
            outcome.verification = Some(verdict);
            if halted {
                outcome.ok = false;
                outcome.error = Some(format!("verify halt: {:?}", outcome.verification));
            }
        }
        Ok(outcome)
    }

    /// Vision-driven click: OCR the window, locate the phrase, click the point
    /// (all through Guard-2). NotFound → honest halt, never a guess.
    pub fn vision_click(&self, window: &WindowInfo, phrase: &str) -> Result<ActOutcome> {
        match self.resolve_by_ocr(window, phrase)? {
            ocr::VisionHit::Point { x, y } | ocr::VisionHit::RegionCenter { x, y, .. } => {
                self.act(window, &ActKind::Click { x, y }, None)
            }
            ocr::VisionHit::NotFound => Ok(ActOutcome {
                kind: ActKind::ClickByName {
                    name: phrase.into(),
                },
                ok: false,
                verification: None,
                error: Some(format!(
                    "phrase {phrase:?} not found in OCR — halting, not guessing"
                )),
            }),
        }
    }
}

/// Bridges the verify cascade to the live engine (re-read + re-OCR).
struct EngineObserver<'a> {
    engine: &'a DesktopEngine,
    window_id: u64,
}

impl<'a> Observer for EngineObserver<'a> {
    fn read_tree(&self, _window_id: u64) -> Option<ReadNode> {
        let window = WindowInfo {
            id: self.window_id,
            title: String::new(),
            app: String::new(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            has_a11y_tree: false,
        };
        self.engine.read(&window).ok()?.tree
    }

    fn ocr(&self, _window_id: u64) -> Vec<types::OcrWord> {
        let window = WindowInfo {
            id: self.window_id,
            title: String::new(),
            app: String::new(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            has_a11y_tree: false,
        };
        self.engine.ocr_window(&window).unwrap_or_default()
    }
}

/// Re-export the OcrEngine trait methods for `locate_phrase` callers.
pub mod prelude {
    pub use crate::ocr::{locate_phrase, OcrEngine, VisionHit};
    pub use crate::policy::GateDecision;
}
