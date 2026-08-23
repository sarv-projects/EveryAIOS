//! The verify cascade (sandraschi / ChatGPT `guidance.md` pattern):
//! observe → **one** action → re-observe → assert the expected state with a
//! locator → retry with backoff → **halt-over-guess** (never continue on an
//! unverified outcome).

use std::time::{Duration, Instant};

use crate::types::{OcrWord, ReadNode, VerifyOutcome};

/// Where the expected state lives after an action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Locator {
    /// A named a11y node should exist (UIA tree).
    UiName(String),
    /// OCR text should appear in the given window region.
    OcrText { text: String, region: crate::types::Region },
    /// A named node should be gone (e.g. the dialog closed).
    UiGone(String),
}

/// The observable world the verifier re-reads after each action.
pub trait Observer: Send + Sync {
    /// Re-read the window after the action (a11y tree or None).
    fn read_tree(&self, window_id: u64) -> Option<ReadNode>;
    /// Re-OCR the window (vision fallback).
    fn ocr(&self, window_id: u64) -> Vec<OcrWord>;
}

/// A null observer for tests that drive the cascade directly.
pub struct FakeObserver {
    pub tree: Option<ReadNode>,
    pub words: Vec<OcrWord>,
}
impl Observer for FakeObserver {
    fn read_tree(&self, _window_id: u64) -> Option<ReadNode> {
        self.tree.clone()
    }
    fn ocr(&self, _window_id: u64) -> Vec<OcrWord> {
        self.words.clone()
    }
}

pub struct Verifier {
    pub max_attempts: u32,
    pub backoff: Duration,
}

impl Default for Verifier {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            backoff: Duration::from_millis(400),
        }
    }
}

impl Verifier {
    /// Check the locator against one observation.
    pub fn satisfied(locator: &Locator, tree: Option<&ReadNode>, words: &[OcrWord]) -> bool {
        match locator {
            Locator::UiName(name) => tree
                .and_then(|t| t.find_by_name(name))
                .is_some(),
            Locator::UiGone(name) => tree
                .and_then(|t| t.find_by_name(name))
                .is_none(),
            Locator::OcrText { text, region } => {
                let needle = text.to_ascii_lowercase();
                words
                    .iter()
                    .filter(|w| region.contains(w.x, w.y))
                    .any(|w| w.text.to_ascii_lowercase().contains(&needle))
            }
        }
    }

    /// Run the cascade: poll the observer until the locator is satisfied or
    /// attempts are exhausted → `Halt` (never guess).
    pub fn verify(&self, window_id: u64, locator: &Locator, observer: &dyn Observer) -> VerifyOutcome {
        for attempt in 1..=self.max_attempts {
            let tree = observer.read_tree(window_id);
            let words = observer.ocr(window_id);
            if Self::satisfied(locator, tree.as_ref(), &words) {
                return if attempt == 1 {
                    VerifyOutcome::Confirmed
                } else {
                    VerifyOutcome::ConfirmedAfterRetry { attempts: attempt }
                };
            }
            if attempt < self.max_attempts {
                std::thread::sleep(self.backoff);
            }
        }
        VerifyOutcome::Halt {
            attempts: self.max_attempts,
            reason: format!("locator {locator:?} not satisfied after {} attempts", self.max_attempts),
        }
    }

    /// Time-boxed variant for tests: same cascade, but stop early if the
    /// deadline passes (returns Halt).
    pub fn verify_until(
        &self,
        window_id: u64,
        locator: &Locator,
        observer: &dyn Observer,
        deadline: Instant,
    ) -> VerifyOutcome {
        for attempt in 1..=self.max_attempts {
            if Instant::now() >= deadline {
                return VerifyOutcome::Halt {
                    attempts: attempt.saturating_sub(1).max(1),
                    reason: "deadline exceeded".into(),
                };
            }
            let tree = observer.read_tree(window_id);
            let words = observer.ocr(window_id);
            if Self::satisfied(locator, tree.as_ref(), &words) {
                return if attempt == 1 {
                    VerifyOutcome::Confirmed
                } else {
                    VerifyOutcome::ConfirmedAfterRetry { attempts: attempt }
                };
            }
            if attempt < self.max_attempts {
                std::thread::sleep(self.backoff);
            }
        }
        VerifyOutcome::Halt {
            attempts: self.max_attempts,
            reason: "attempts exhausted".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Region;

    fn node(name: &str) -> ReadNode {
        ReadNode {
            index_path: "1".into(),
            role: "Button".into(),
            name: name.into(),
            automation_id: None,
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            actionable: true,
            children: vec![],
        }
    }

    fn word(text: &str) -> OcrWord {
        OcrWord {
            text: text.into(),
            confidence: 90.0,
            x: 100,
            y: 100,
            width: 40,
            height: 10,
        }
    }

    #[test]
    fn confirmed_on_first_observation() {
        let v = Verifier::default();
        let obs = FakeObserver {
            tree: Some(node("Save")),
            words: vec![],
        };
        assert_eq!(
            v.verify(1, &Locator::UiName("save".into()), &obs),
            VerifyOutcome::Confirmed
        );
    }

    #[test]
    fn retries_then_halts_never_guesses() {
        let v = Verifier {
            max_attempts: 3,
            backoff: Duration::from_millis(1),
        };
        let obs = FakeObserver {
            tree: None,
            words: vec![],
        };
        match v.verify(1, &Locator::UiName("Save".into()), &obs) {
            VerifyOutcome::Halt { attempts, .. } => assert_eq!(attempts, 3),
            other => panic!("expected Halt, got {other:?}"),
        }
    }

    #[test]
    fn ocr_locator_matches_within_region() {
        let v = Verifier::default();
        let obs = FakeObserver {
            tree: None,
            words: vec![word("Submit")],
        };
        let region = Region {
            x: 0,
            y: 0,
            width: 500,
            height: 500,
        };
        assert_eq!(
            v.verify(1, &Locator::OcrText { text: "submit".into(), region }, &obs),
            VerifyOutcome::Confirmed
        );
    }

    #[test]
    fn ocr_locator_respects_region() {
        let v = Verifier::default();
        let obs = FakeObserver {
            tree: None,
            words: vec![word("Submit")],
        };
        let far = Region {
            x: 1000,
            y: 1000,
            width: 10,
            height: 10,
        };
        let out = v.verify(1, &Locator::OcrText { text: "submit".into(), region: far }, &obs);
        assert!(matches!(out, VerifyOutcome::Halt { .. }));
    }

    #[test]
    fn ui_gone_confirmed_when_dialog_closed() {
        let v = Verifier::default();
        let obs = FakeObserver {
            tree: None,
            words: vec![],
        };
        assert_eq!(
            v.verify(1, &Locator::UiGone("Confirm dialog".into()), &obs),
            VerifyOutcome::Confirmed
        );
    }
}
