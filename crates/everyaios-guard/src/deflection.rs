//! P62.5 — shell-bias deflection.
//!
//! An external agent that reaches for a spreadsheet, the browser, or the
//! desktop through raw Python or a shell command is pointed at the shared
//! façade instead. This module only classifies the command and returns a
//! structured nudge. It does not execute, and it does not authorize.

/// Which shared plane the command was trying to bypass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeflectionTarget {
    Office,
    Browser,
    Desktop,
}

impl DeflectionTarget {
    /// The façade family the agent should call.
    pub fn facade(self) -> &'static str {
        match self {
            Self::Office => "office",
            Self::Browser => "browser",
            Self::Desktop => "computer_use",
        }
    }
}

/// A recovery hint. The agent is told which façade to use and why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeflectionNudge {
    pub target: DeflectionTarget,
    pub matched: String,
    pub message: String,
}

/// Libraries and commands that mean "drive Office / the browser / the desktop
/// from a shell" rather than through the shared plane.
const OFFICE: &[&str] = &[
    "openpyxl",
    "python-docx",
    "python_docx",
    "pptx",
    "xlsxwriter",
    "libreoffice --headless",
];
const BROWSER: &[&str] = &["puppeteer", "playwright", "selenium", "chromedriver"];
const DESKTOP: &[&str] = &["pyautogui", "xdotool", "sendinput", "cliclick"];

/// Inspect a shell or Python command. `None` means the command is not one of
/// the bypass shapes this gate knows about.
pub fn deflect_shell_bias(command: &str) -> Option<DeflectionNudge> {
    let folded = command.to_ascii_lowercase();
    if let Some(hit) = first_hit(&folded, OFFICE) {
        return Some(nudge(DeflectionTarget::Office, hit));
    }
    if let Some(hit) = first_hit(&folded, BROWSER) {
        return Some(nudge(DeflectionTarget::Browser, hit));
    }
    if let Some(hit) = first_hit(&folded, DESKTOP) {
        return Some(nudge(DeflectionTarget::Desktop, hit));
    }
    None
}

fn first_hit<'a>(folded: &str, needles: &'a [&'a str]) -> Option<&'a str> {
    needles
        .iter()
        .copied()
        .find(|needle| folded.contains(needle))
}

fn nudge(target: DeflectionTarget, matched: &str) -> DeflectionNudge {
    DeflectionNudge {
        message: format!(
            "deflection_nudge: `{matched}` drives {} outside the shared plane. Call the `{facade}.*` façade instead; Guard authorizes that path.",
            match target {
                DeflectionTarget::Office => "a document",
                DeflectionTarget::Browser => "a browser",
                DeflectionTarget::Desktop => "the desktop",
            },
            facade = target.facade(),
        ),
        target,
        matched: matched.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn office_python_is_nudged_to_the_office_facade() {
        let nudge = deflect_shell_bias("python -c 'import openpyxl'").unwrap();
        assert_eq!(nudge.target, DeflectionTarget::Office);
        assert_eq!(nudge.target.facade(), "office");
        assert!(nudge.message.contains("deflection_nudge"));
    }

    #[test]
    fn browser_and_desktop_commands_pick_their_facade() {
        assert_eq!(
            deflect_shell_bias("npx playwright test").unwrap().target,
            DeflectionTarget::Browser
        );
        assert_eq!(
            deflect_shell_bias("xdotool click 1").unwrap().target,
            DeflectionTarget::Desktop
        );
    }

    #[test]
    fn ordinary_shell_is_not_a_bypass() {
        assert!(deflect_shell_bias("cargo test -p everyaios-guard").is_none());
        assert!(deflect_shell_bias("python -c 'print(1)'").is_none());
    }
}
