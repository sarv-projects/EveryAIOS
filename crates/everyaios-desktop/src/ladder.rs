//! The desktop **click ladder**: an escalation contract expressed as a type,
//! not as prose.
//!
//! Before this module the escalation was a control-flow accident: two
//! mechanisms sat in one function (`platform::win::background_click` did UIA
//! `InvokePattern`, then a `PostMessageW` message click, and every other
//! coordinate path went straight to `SetCursorPos`) with no declared order, no
//! record of which one ran, and no gate on the lowest rung. That is a silent
//! fall-through to raw input whenever the higher-fidelity rung was available
//! and merely failed — the exact failure this contract exists to prevent.
//!
//! What is real, and is therefore what the ladder declares:
//!
//! | Rung | Mechanism | Windows | Linux/X11 | macOS |
//! |---|---|---|---|---|
//! | [`ClickRung::AccessibilityInvoke`] | invoke the control through the platform's accessibility API | UIA `InvokePattern` at the hit-test point | **none** — no AT-SPI client in the dependency set | **none by point** — `AXPress` needs an ApplicationServices FFI layer that is not in the dependency set (a *named* AX click is available, but the coordinate ladder has no by-point form) |
//! | [`ClickRung::SyntheticEvent`] | address a synthetic event to the target window itself | `PostMessageW(WM_LBUTTONDOWN/UP)` to the deepest child | `SendEvent(ButtonPress/ButtonRelease)` to the deepest child | **none** — macOS has no message-level primitive at all |
//! | [`ClickRung::RawInput`] | global physical input injection (moves the real pointer) | `SetCursorPos` + `SendInput`/`mouse_event` | `XTEST` fake motion + button | System Events `click at` (`CGEvent`) |
//!
//! Two consequences, both deliberate:
//!
//! - `RawInput` **moves the user's pointer and needs the target focused**. The
//!   architecture marks exactly that as a human-decision point, so
//!   [`ClickRung::gate`] returns [`RungGate::HumanAuthorization`] for it and
//!   *only* for it. [`walk_ladder`] stops there and surfaces the Guard
//!   decision; it never continues past a gated rung and never reaches raw
//!   input on its own.
//! - Each platform declares, as data, which rungs it can actually perform
//!   ([`ClickProfile`]). A platform with no message primitive (macOS) or no
//!   accessibility client (X11) starts lower in the ladder and says so in
//!   [`ClickProfile::limits`], rather than pretending the rung exists.
//!
//! The walk itself ([`walk_ladder`]) is pure and driver-injected, so the whole
//! escalation policy — order, the stop-at-the-gate, no-skip, exhaustion — is
//! testable without a desktop.

use serde::{Deserialize, Serialize};

use crate::types::{ActKind, WindowInfo};

/// One rung of the click ladder, in strict fidelity order.
///
/// The **declaration order is the fidelity order** and `Ord` derives from it,
/// so "raw input is last" is a property of the type rather than a convention
/// a future edit could quietly break.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClickRung {
    /// Rung 1 — activate the control through the platform's accessibility API
    /// (Windows UIA `InvokePattern`/`ValuePattern`). Highest fidelity: it
    /// activates the *control*, not a point, so it is immune to a stale
    /// coordinate and to DPI rounding.
    AccessibilityInvoke,
    /// Rung 2 — address a synthetic event/message to the target window itself.
    /// No pointer motion and no focus change, but it needs a coordinate, and an
    /// app is free to ignore a synthetic event.
    SyntheticEvent,
    /// Rung 3 — inject real physical input. Moves the user's pointer, requires
    /// the target focused, and is the rung the architecture marks as needing a
    /// human decision.
    RawInput,
}

impl ClickRung {
    /// Every rung, in fidelity order. The single source of the ladder order.
    pub const ALL: [ClickRung; 3] = [
        ClickRung::AccessibilityInvoke,
        ClickRung::SyntheticEvent,
        ClickRung::RawInput,
    ];

    /// 1-based rank (used by the audit row and the ordering invariant).
    pub fn rank(self) -> u8 {
        match self {
            ClickRung::AccessibilityInvoke => 1,
            ClickRung::SyntheticEvent => 2,
            ClickRung::RawInput => 3,
        }
    }

    /// Stable wire string (`accessibility_invoke` | `synthetic_event` |
    /// `raw_input`).
    pub fn as_str(self) -> &'static str {
        match self {
            ClickRung::AccessibilityInvoke => "accessibility_invoke",
            ClickRung::SyntheticEvent => "synthetic_event",
            ClickRung::RawInput => "raw_input",
        }
    }

    /// Does this rung move the user's real pointer? Only the last one does.
    pub fn moves_pointer(self) -> bool {
        matches!(self, ClickRung::RawInput)
    }

    /// Does this rung need the target to be foreground? Only the last one does.
    pub fn requires_foreground(self) -> bool {
        matches!(self, ClickRung::RawInput)
    }

    /// Can this rung be delivered under the Background interaction default (no
    /// cursor theft, no focus steal)?
    pub fn background_capable(self) -> bool {
        !self.moves_pointer() && !self.requires_foreground()
    }

    /// What the authority has to say before this rung may run.
    ///
    /// Exactly one rung is gated, and it is the lowest-fidelity one, because
    /// exactly one rung changes what the *human* experiences (their cursor
    /// moves, their focus changes).
    pub fn gate(self) -> RungGate {
        match self {
            ClickRung::AccessibilityInvoke | ClickRung::SyntheticEvent => RungGate::Automatic,
            ClickRung::RawInput => RungGate::HumanAuthorization,
        }
    }

    /// A human sentence naming the mechanism, for the Guard card / audit row.
    pub fn describe(self) -> String {
        match self {
            ClickRung::AccessibilityInvoke => {
                "accessibility invoke (activate the control, not a point)".into()
            }
            ClickRung::SyntheticEvent => {
                "synthetic event addressed to the target window (no pointer motion, no focus)"
                    .into()
            }
            ClickRung::RawInput => "raw pointer injection (moves your cursor, needs focus)".into(),
        }
    }
}

/// The authority requirement a rung carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RungGate {
    /// May be attempted without asking anyone.
    Automatic,
    /// The architecture marks this as a human-decision point. The walk **stops**
    /// and surfaces the Guard decision; it does not continue to a lower rung
    /// and it does not run the rung itself.
    HumanAuthorization,
}

/// How one rung attempt ended, recorded so a fall-through is always visible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RungAttemptOutcome {
    /// The rung reached the target.
    Delivered,
    /// The platform cannot perform this rung here (no primitive, no element at
    /// the point, a different process owns it). The ladder may try the next.
    Unavailable,
    /// The rung was attempted and did not work. The ladder may try the next.
    Failed,
}

impl RungAttemptOutcome {
    pub fn as_str(&self) -> &'static str {
        match self {
            RungAttemptOutcome::Delivered => "delivered",
            RungAttemptOutcome::Unavailable => "unavailable",
            RungAttemptOutcome::Failed => "failed",
        }
    }
}

/// One rung's attempt, with the platform's own reason.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RungAttempt {
    pub rung: ClickRung,
    pub outcome: RungAttemptOutcome,
    /// The platform's reason, verbatim. Never empty for a non-delivered rung.
    pub detail: String,
}

impl RungAttempt {
    fn new(rung: ClickRung, outcome: RungAttemptOutcome, detail: impl Into<String>) -> Self {
        Self {
            rung,
            outcome,
            detail: detail.into(),
        }
    }
}

/// What a platform reports when asked to perform one rung.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RungDelivery {
    /// The act reached the target through this rung.
    Delivered(String),
    /// This platform cannot do this rung here — the ladder may try the next.
    Unavailable(String),
    /// Tried, did not work — the ladder may try the next.
    Failed(String),
    /// A hard stop (kill switch, Guard refusal surfaced from inside the rung).
    /// The ladder does **not** continue past this.
    Blocked(String),
}

/// The verdict of one ladder walk: which rung ran, or why none did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "verdict", content = "detail")]
pub enum LadderVerdict {
    /// A rung delivered the act.
    Delivered {
        rung: ClickRung,
        attempts: Vec<RungAttempt>,
    },
    /// The walk reached a rung the architecture marks as needing a human
    /// decision and the authority did not grant it. **Nothing was executed.**
    /// `reason` is the Guard decision verbatim.
    NeedsAuthorization {
        rung: ClickRung,
        reason: String,
        attempts: Vec<RungAttempt>,
    },
    /// A hard stop inside a rung (Guard/kill switch). Nothing after it ran.
    Refused {
        rung: ClickRung,
        reason: String,
        attempts: Vec<RungAttempt>,
    },
    /// Every rung this platform can perform was tried and none delivered.
    Exhausted {
        attempts: Vec<RungAttempt>,
    },
    /// The platform's declared ladder violates the ordering invariant. Fail
    /// closed rather than run an undeclared escalation.
    Misconfigured { reason: String },
}

impl LadderVerdict {
    /// Which rung actually ran, if any. `None` means nothing was executed.
    pub fn rung(&self) -> Option<ClickRung> {
        match self {
            LadderVerdict::Delivered { rung, .. } => Some(*rung),
            _ => None,
        }
    }

    /// Did the act land?
    pub fn delivered(&self) -> bool {
        matches!(self, LadderVerdict::Delivered { .. })
    }

    /// Did the walk stop because authority was missing or refused?
    pub fn is_authorization_gap(&self) -> bool {
        matches!(self, LadderVerdict::NeedsAuthorization { .. })
    }

    /// Every rung that was attempted, in order.
    pub fn attempts(&self) -> &[RungAttempt] {
        match self {
            LadderVerdict::Delivered { attempts, .. }
            | LadderVerdict::NeedsAuthorization { attempts, .. }
            | LadderVerdict::Refused { attempts, .. }
            | LadderVerdict::Exhausted { attempts } => attempts,
            LadderVerdict::Misconfigured { .. } => &[],
        }
    }

    /// Did the walk fall through at least one rung? (True for any delivered
    /// result above the first rung, or any exhaustion.)
    pub fn escalated(&self) -> bool {
        self.attempts()
            .iter()
            .any(|a| a.outcome != RungAttemptOutcome::Delivered)
    }

    /// One honest sentence for an audit row, a Guard card, or a refusal.
    pub fn describe(&self) -> String {
        match self {
            LadderVerdict::Delivered { rung, attempts } => {
                let trail = if attempts.is_empty() {
                    String::new()
                } else {
                    format!(
                        " (after {}: {})",
                        attempts.len(),
                        attempts
                            .iter()
                            .map(|a| format!("{} {}", a.rung.as_str(), a.outcome.as_str()))
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                };
                format!("delivered by rung {}: {}{trail}", rung.rank(), rung.describe())
            }
            LadderVerdict::NeedsAuthorization {
                rung,
                reason,
                attempts,
            } => format!(
                "stopped at rung {} ({}): {reason}; {} higher-fidelity rung(s) tried first",
                rung.rank(),
                rung.as_str(),
                attempts.len()
            ),
            LadderVerdict::Refused {
                rung,
                reason,
                attempts,
            } => format!(
                "refused at rung {} ({}): {reason}; nothing after it ran ({} attempt(s) first)",
                rung.rank(),
                rung.as_str(),
                attempts.len()
            ),
            LadderVerdict::Exhausted { attempts } => {
                let trail = attempts
                    .iter()
                    .map(|a| format!("{} {}", a.rung.as_str(), a.outcome.as_str()))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("no rung could deliver it (tried: {trail})")
            }
            LadderVerdict::Misconfigured { reason } => {
                format!("click ladder refused to run: {reason}")
            }
        }
    }

    /// The compact JSON form the audit chain and the Tauri surface carry.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "verdict": match self {
                LadderVerdict::Delivered { .. } => "delivered",
                LadderVerdict::NeedsAuthorization { .. } => "needs_authorization",
                LadderVerdict::Refused { .. } => "refused",
                LadderVerdict::Exhausted { .. } => "exhausted",
                LadderVerdict::Misconfigured { .. } => "misconfigured",
            },
            "rung": self.rung().map(|r| r.as_str()),
            "rungRank": self.rung().map(|r| r.rank()),
            "escalated": self.escalated(),
            "attempts": self.attempts(),
            "summary": self.describe(),
        })
    }
}

/// What a platform can genuinely do, declared as data.
///
/// The ordering invariant ([`ClickProfile::validate`]) is enforced at
/// construction: a profile that puts `RawInput` anywhere but last, repeats a
/// rung, or lists them out of fidelity order is **rejected**, so a
/// "higher-fidelity rung was available" state cannot be expressed at all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClickProfile {
    /// Coarse platform name (`windows`, `linux`, `macos`) for the audit row.
    pub platform: &'static str,
    /// The rungs this platform can perform, in fidelity order.
    pub rungs: Vec<ClickRung>,
    /// What this platform genuinely cannot do, stated. Never inferred from a
    /// rung list; this is the sentence an operator reads.
    pub limits: Vec<String>,
}

impl ClickProfile {
    pub fn new(
        platform: &'static str,
        rungs: Vec<ClickRung>,
        limits: Vec<String>,
    ) -> Result<Self, String> {
        let profile = Self {
            platform,
            rungs,
            limits,
        };
        profile.validate()?;
        Ok(profile)
    }

    /// The ordering invariant. This is the mechanism that makes "never fall
    /// through to raw input when a higher-fidelity rung was available"
    /// unrepresentable rather than merely documented.
    pub fn validate(&self) -> Result<(), String> {
        if self.rungs.is_empty() {
            return Err(format!("{} declares no click rungs", self.platform));
        }
        let mut previous: Option<ClickRung> = None;
        for rung in &self.rungs {
            if let Some(prev) = previous {
                if *rung == prev {
                    return Err(format!(
                        "{} lists {} twice — a duplicate rung is a declared fall-through",
                        self.platform,
                        rung.as_str()
                    ));
                }
                if *rung < prev {
                    return Err(format!(
                        "{} lists {} before {} — the ladder must run in fidelity order \
                         ({} is the lower-fidelity mechanism)",
                        self.platform,
                        rung.as_str(),
                        prev.as_str(),
                        prev.as_str()
                    ));
                }
            }
            previous = Some(*rung);
        }
        if let Some(last) = self.rungs.last()
            && last.moves_pointer()
            && self.rungs.len() > 1
        {
            return Err(format!(
                "{} lists the pointer-moving rung {} as the last of several rungs — raw \
                 input must be the last and only gated rung",
                self.platform,
                last.as_str()
            ));
        }
        Ok(())
    }

    /// Is a gated rung even reachable on this platform?
    pub fn has_gated_rung(&self) -> bool {
        self.rungs
            .iter()
            .any(|r| r.gate() == RungGate::HumanAuthorization)
    }

    /// The rungs a Background-mode act may use (never the gated one).
    pub fn background_rungs(&self) -> Vec<ClickRung> {
        self.rungs
            .iter()
            .copied()
            .filter(|r| r.background_capable())
            .collect()
    }
}

/// What the ladder is being asked to deliver, on a named window.
#[derive(Debug, Clone, PartialEq)]
pub struct LadderTarget {
    pub window: WindowInfo,
    /// The act whose point (or named control) the ladder resolves per rung.
    pub act: ActKind,
}

impl LadderTarget {
    pub fn new(window: WindowInfo, act: ActKind) -> Self {
        Self { window, act }
    }
}

/// A platform's ability to attempt rungs, and the authority to gate them.
pub trait ClickLadderDriver {
    /// The platform's declared ladder.
    fn profile(&self) -> &ClickProfile;

    /// Attempt one rung at the target. Must never itself ask the authority:
    /// the walk owns the gate, so the ordering cannot be bypassed.
    fn attempt(&self, rung: ClickRung, target: &LadderTarget) -> RungDelivery;

    /// Ask the authority whether a gated rung may run. `Err(reason)` is the
    /// decision, surfaced verbatim; the walk stops there.
    ///
    /// The real implementation is `DesktopGuard::authorize_rung`, i.e. the same
    /// policy → human-gate → audit path every other desktop effect rides. A
    /// ladder that could not route here would be a Guard bypass (I12), so the
    /// trait has no "skip the gate" method at all.
    fn authorize(&self, rung: ClickRung, target: &LadderTarget) -> Result<(), String>;
}

/// Walk the ladder for one act.
///
/// The contract, in one place:
/// - rungs are tried in the profile's declared fidelity order, one at a time;
/// - reaching a gated rung **stops the walk** and returns
///   [`LadderVerdict::NeedsAuthorization`] carrying the authority's reason —
///   the ladder never runs it itself and never continues past it;
/// - a hard stop inside a rung ([`RungDelivery::Blocked`]) also stops the walk;
/// - every attempt is recorded, so a fall-through is always visible in the
///   result rather than inferred from behaviour;
/// - a profile that violates the ordering invariant fails closed.
pub fn walk_ladder<D: ClickLadderDriver + ?Sized>(
    driver: &D,
    target: &LadderTarget,
) -> LadderVerdict {
    let profile = driver.profile();
    if let Err(reason) = profile.validate() {
        return LadderVerdict::Misconfigured { reason };
    }
    let mut attempts: Vec<RungAttempt> = Vec::new();
    for rung in profile.rungs.iter().copied() {
        if rung.gate() == RungGate::HumanAuthorization {
            if let Err(reason) = driver.authorize(rung, target) {
                // Stop. Not "try the next rung" — raw input is the last rung,
                // and running it without a decision is the failure this whole
                // contract exists to prevent.
                return LadderVerdict::NeedsAuthorization {
                    rung,
                    reason,
                    attempts,
                };
            }
        }
        match driver.attempt(rung, target) {
            RungDelivery::Delivered(detail) => {
                attempts.push(RungAttempt::new(rung, RungAttemptOutcome::Delivered, detail));
                return LadderVerdict::Delivered { rung, attempts };
            }
            RungDelivery::Unavailable(detail) => attempts.push(RungAttempt::new(
                rung,
                RungAttemptOutcome::Unavailable,
                detail,
            )),
            RungDelivery::Failed(detail) => {
                attempts.push(RungAttempt::new(rung, RungAttemptOutcome::Failed, detail))
            }
            RungDelivery::Blocked(detail) => {
                attempts.push(RungAttempt::new(rung, RungAttemptOutcome::Failed, detail.clone()));
                return LadderVerdict::Refused {
                    rung,
                    reason: detail,
                    attempts,
                };
            }
        }
    }
    LadderVerdict::Exhausted { attempts }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn window() -> WindowInfo {
        WindowInfo {
            id: 7,
            title: "Editor".into(),
            app: "editor".into(),
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            has_a11y_tree: true,
        }
    }

    fn target() -> LadderTarget {
        LadderTarget::new(window(), ActKind::Click { x: 10, y: 20 })
    }

    /// A scriptable driver: per-rung scripted delivery outcomes, a scripted
    /// authority answer, and a call log.
    struct FakeDriver {
        profile: ClickProfile,
        script: Vec<(ClickRung, RungDelivery)>,
        authorize: Option<Result<(), String>>,
        calls: RefCell<Vec<ClickRung>>,
        authorized: RefCell<Vec<ClickRung>>,
    }

    impl FakeDriver {
        fn windows_full(script: Vec<(ClickRung, RungDelivery)>, authorize: Option<Result<(), String>>) -> Self {
            Self {
                profile: ClickProfile::new(
                    "fake",
                    vec![
                        ClickRung::AccessibilityInvoke,
                        ClickRung::SyntheticEvent,
                        ClickRung::RawInput,
                    ],
                    vec![],
                )
                .unwrap(),
                script,
                authorize,
                calls: RefCell::new(Vec::new()),
                authorized: RefCell::new(Vec::new()),
            }
        }
    }

    impl ClickLadderDriver for FakeDriver {
        fn profile(&self) -> &ClickProfile {
            &self.profile
        }

        fn attempt(&self, rung: ClickRung, _target: &LadderTarget) -> RungDelivery {
            self.calls.borrow_mut().push(rung);
            self.script
                .iter()
                .find(|(r, _)| *r == rung)
                .map(|(_, d)| d.clone())
                .unwrap_or_else(|| RungDelivery::Unavailable(format!("{rung:?} not scripted")))
        }

        fn authorize(&self, rung: ClickRung, _target: &LadderTarget) -> Result<(), String> {
            self.authorized.borrow_mut().push(rung);
            self.authorize
                .clone()
                .unwrap_or_else(|| Ok(()))
        }
    }

    // ---- the type itself ----------------------------------------------

    #[test]
    fn raw_input_is_the_only_gated_the_only_pointer_moving_last_rung() {
        for rung in ClickRung::ALL {
            if rung == ClickRung::RawInput {
                assert_eq!(rung.gate(), RungGate::HumanAuthorization);
                assert!(rung.moves_pointer());
                assert!(rung.requires_foreground());
                assert!(!rung.background_capable());
            } else {
                assert_eq!(rung.gate(), RungGate::Automatic, "{}", rung.as_str());
                assert!(!rung.moves_pointer());
                assert!(!rung.requires_foreground());
                assert!(rung.background_capable());
            }
        }
        // Declaration order is the fidelity order, and raw input is last.
        assert_eq!(ClickRung::ALL[2], ClickRung::RawInput);
        assert!(ClickRung::AccessibilityInvoke < ClickRung::SyntheticEvent);
        assert!(ClickRung::SyntheticEvent < ClickRung::RawInput);
        assert_eq!(ClickRung::RawInput.rank(), 3);
    }

    // ---- the walk -----------------------------------------------------

    #[test]
    fn the_highest_fidelity_rung_is_tried_first_and_never_skipped() {
        let d = FakeDriver::windows_full(
            vec![(ClickRung::AccessibilityInvoke, RungDelivery::Delivered("invoked".into()))],
            None,
        );
        let v = walk_ladder(&d, &target());
        assert_eq!(v.rung(), Some(ClickRung::AccessibilityInvoke));
        assert!(v.delivered());
        assert!(!v.escalated());
        assert_eq!(*d.calls.borrow(), vec![ClickRung::AccessibilityInvoke]);
    }

    #[test]
    fn it_falls_through_to_the_message_rung_and_records_the_trail() {
        let d = FakeDriver::windows_full(
            vec![
                (
                    ClickRung::AccessibilityInvoke,
                    RungDelivery::Unavailable("no invokable element at the point".into()),
                ),
                (
                    ClickRung::SyntheticEvent,
                    RungDelivery::Delivered("WM_LBUTTON pair posted".into()),
                ),
            ],
            None,
        );
        let v = walk_ladder(&d, &target());
        assert_eq!(v.rung(), Some(ClickRung::SyntheticEvent));
        assert!(v.escalated());
        assert_eq!(v.attempts().len(), 2);
        assert_eq!(v.attempts()[0].outcome, RungAttemptOutcome::Unavailable);
        assert!(v.attempts()[0].detail.contains("no invokable"));
        // Raw input was never even asked about.
        assert!(!d.calls.borrow().contains(&ClickRung::RawInput));
        assert!(d.authorized.borrow().is_empty());
        assert!(v.describe().contains("rung 2"));
    }

    #[test]
    fn reaching_the_gated_rung_without_authority_stops_and_runs_nothing() {
        let d = FakeDriver::windows_full(
            vec![
                (
                    ClickRung::AccessibilityInvoke,
                    RungDelivery::Unavailable("canvas".into()),
                ),
                (
                    ClickRung::SyntheticEvent,
                    RungDelivery::Failed("app ignored the synthetic event".into()),
                ),
                (
                    ClickRung::RawInput,
                    RungDelivery::Delivered("SHOULD NEVER RUN".into()),
                ),
            ],
            Some(Err("gate decision: deny".into())),
        );
        let v = walk_ladder(&d, &target());
        assert!(!v.delivered());
        assert!(v.is_authorization_gap());
        match &v {
            LadderVerdict::NeedsAuthorization { rung, reason, attempts } => {
                assert_eq!(*rung, ClickRung::RawInput);
                assert_eq!(reason, "gate decision: deny");
                assert_eq!(attempts.len(), 2, "both ungated rungs were tried first");
            }
            other => panic!("expected NeedsAuthorization, got {other:?}"),
        }
        // The gated rung was *authorised against* but never attempted.
        assert_eq!(*d.authorized.borrow(), vec![ClickRung::RawInput]);
        assert!(!d.calls.borrow().contains(&ClickRung::RawInput));
        let summary = v.describe();
        assert!(summary.contains("stopped at rung 3"), "{summary}");
        assert!(summary.contains("gate decision: deny"), "{summary}");
    }

    #[test]
    fn an_approved_gate_lets_the_last_rung_run_and_says_it_escalated() {
        let d = FakeDriver::windows_full(
            vec![
                (
                    ClickRung::AccessibilityInvoke,
                    RungDelivery::Unavailable("no element".into()),
                ),
                (
                    ClickRung::SyntheticEvent,
                    RungDelivery::Unavailable("not a message target".into()),
                ),
                (
                    ClickRung::RawInput,
                    RungDelivery::Delivered("SendInput at (10,20)".into()),
                ),
            ],
            Some(Ok(())),
        );
        let v = walk_ladder(&d, &target());
        assert_eq!(v.rung(), Some(ClickRung::RawInput));
        assert!(v.delivered());
        assert!(v.escalated());
        assert_eq!(*d.authorized.borrow(), vec![ClickRung::RawInput]);
    }

    #[test]
    fn a_hard_stop_inside_a_rung_does_not_continue_to_the_next_one() {
        let d = FakeDriver::windows_full(
            vec![
                (
                    ClickRung::AccessibilityInvoke,
                    RungDelivery::Blocked("emergency stop engaged".into()),
                ),
                (
                    ClickRung::SyntheticEvent,
                    RungDelivery::Delivered("SHOULD NEVER RUN".into()),
                ),
            ],
            Some(Ok(())),
        );
        let v = walk_ladder(&d, &target());
        assert!(!v.delivered());
        assert!(!v.is_authorization_gap(), "a block is not an auth gap");
        assert!(matches!(v, LadderVerdict::Refused { .. }));
        assert_eq!(*d.calls.borrow(), vec![ClickRung::AccessibilityInvoke]);
    }

    #[test]
    fn exhaustion_names_every_rung_it_tried() {
        let d = FakeDriver::windows_full(
            vec![
                (
                    ClickRung::AccessibilityInvoke,
                    RungDelivery::Unavailable("no tree".into()),
                ),
                (
                    ClickRung::SyntheticEvent,
                    RungDelivery::Failed("ignored".into()),
                ),
            ],
            Some(Err("no card".into())),
        );
        let v = walk_ladder(&d, &target());
        assert!(matches!(v, LadderVerdict::Exhausted { .. }));
        let summary = v.describe();
        assert!(summary.contains("accessibility_invoke unavailable"), "{summary}");
        assert!(summary.contains("synthetic_event failed"), "{summary}");
    }

    // ---- the profile invariant ----------------------------------------

    #[test]
    fn a_profile_that_puts_raw_input_above_a_higher_rung_is_rejected() {
        let err = ClickProfile::new(
            "bogus",
            vec![ClickRung::RawInput, ClickRung::AccessibilityInvoke],
            vec![],
        )
        .unwrap_err();
        assert!(err.contains("fidelity order"), "{err}");
        // A duplicate is also a declared fall-through, and is rejected.
        let dup = ClickProfile::new(
            "bogus",
            vec![
                ClickRung::SyntheticEvent,
                ClickRung::SyntheticEvent,
            ],
            vec![],
        )
        .unwrap_err();
        assert!(dup.contains("twice"), "{dup}");
        // An empty ladder has no escalation contract at all.
        assert!(ClickProfile::new("bogus", vec![], vec![]).is_err());
    }

    #[test]
    fn a_walk_over_a_broken_profile_fails_closed() {
        #[derive(Default)]
        struct Broken;
        impl ClickLadderDriver for Broken {
            fn profile(&self) -> &ClickProfile {
                // Built by bypassing `new` on purpose: a hand-constructed
                // profile must not be runnable.
                static P: std::sync::OnceLock<ClickProfile> = std::sync::OnceLock::new();
                P.get_or_init(|| ClickProfile {
                    platform: "broken",
                    rungs: vec![ClickRung::RawInput, ClickRung::AccessibilityInvoke],
                    limits: vec![],
                })
            }
            fn attempt(&self, _r: ClickRung, _t: &LadderTarget) -> RungDelivery {
                RungDelivery::Delivered("SHOULD NEVER RUN".into())
            }
            fn authorize(&self, _r: ClickRung, _t: &LadderTarget) -> Result<(), String> {
                Ok(())
            }
        }
        let v = walk_ladder(&Broken, &target());
        assert!(matches!(v, LadderVerdict::Misconfigured { .. }));
        assert!(!v.delivered());
    }

    #[test]
    fn the_three_shipped_profiles_are_ordered_and_state_their_limits() {
        let windows = ClickProfile::new(
            "windows",
            vec![
                ClickRung::AccessibilityInvoke,
                ClickRung::SyntheticEvent,
                ClickRung::RawInput,
            ],
            vec![],
        )
        .expect("the Windows ladder is a fixed, ordered literal");
        let linux = ClickProfile::new(
            "linux",
            vec![ClickRung::SyntheticEvent, ClickRung::RawInput],
            vec!["no accessibility invoke: no AT-SPI client is linked, so the ladder \
                 starts at the synthetic-event rung"
                .into()],
        )
        .expect("the linux ladder is a fixed, ordered literal");
        let mac = ClickProfile::new(
            "macos",
            vec![ClickRung::RawInput],
            vec![
                "no message-level primitive exists on macOS: System Events has no \
                 window-message click, so a coordinate click has no synthetic-event rung"
                    .into(),
                "no accessibility invoke by point: AXPress needs an ApplicationServices \
                 FFI layer that is not in the dependency set (a *named* AX click exists, \
                 but the coordinate ladder has no by-point form)"
                    .into(),
            ],
        )
        .expect("the macOS ladder is a fixed, ordered literal");
        let profiles = [&windows, &linux, &mac];
        for p in profiles {
            p.validate()
                .unwrap_or_else(|e| panic!("{} profile invalid: {e}", p.platform));
            // Every platform can reach raw input, and on every platform that
            // rung is gated and last.
            assert!(p.has_gated_rung(), "{}", p.platform);
            assert_eq!(p.rungs.last(), Some(&ClickRung::RawInput), "{}", p.platform);
            // And the ungated rungs are exactly the non-moving ones.
            for r in p.background_rungs() {
                assert!(!r.moves_pointer(), "{}/{}", p.platform, r.as_str());
            }
        }
        // The three platforms really do differ, and the difference is declared.
        assert_eq!(windows.rungs.len(), 3);
        assert_eq!(linux.rungs.len(), 2);
        // macOS's coordinate ladder is a single, gated rung — and it says so.
        assert_eq!(mac.rungs.len(), 1);
        assert!(mac.background_rungs().is_empty());
        assert!(mac.limits.iter().any(|l| l.contains("no message-level primitive")));
        assert!(mac.limits.iter().any(|l| l.contains("no accessibility invoke by point")));
    }
}
