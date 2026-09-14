//! macOS backend (E9 twin) — zero-dependency subprocess surface, the same
//! shape as ChatGPT Mac Computer Use:
//!
//! - **See:** `screencapture -l <windowid> -x` (Screen Recording permission).
//! - **Read:** `osascript` System Events for the app + window list; deep AX
//!   tree traversal is a follow-on (this build reads windows + OCR).
//! - **Act:** System Events `click at`, `keystroke`, `key code`, scroll via
//!   `scroll` action (Accessibility permission).
//!   **P57.3:** `activate` (System Events / `tell application … to activate`)
//!   happens only on the foreground path; under the Background default the
//!   script targets the process by name without activating it, and a launch
//!   uses `open -g` so the app does not come to the front.
//!   **P57.4:** System Events has no message-level or `AXPress`-by-point
//!   primitive, so a coordinate click / scroll / drag *is* real pointer motion
//!   here. Under the Background default those refuse with an actionable
//!   sentence (the named-element click is the background path that works),
//!   instead of moving the user's cursor behind their back.
//!   **P57.1:** launch opens the canonical path (`.app` bundle or binary).
//!
//! Compiles on every target; live use requires macOS + the two TCC
//! permissions, surfaced honestly through `capabilities()`.

use std::process::Command;

// `DynamicImage::dimensions()` is a `GenericImageView` method, not inherent to
// the enum — without this import `see()` does not compile on macOS.
use image::GenericImageView;

use crate::launch;
use crate::policy::InteractionMode;
use crate::types::{ActKind, ReadResult, Region, SeeMethod, SeeResult, WindowInfo};
use crate::DesktopError;

pub struct MacBackend;

impl MacBackend {
    /// Apps with visible windows (System Events).
    pub fn list_apps() -> Vec<String> {
        let out = Command::new("osascript")
            .arg("-e")
            .arg(
                "tell application \"System Events\" to get name of every process whose background only is false",
            )
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();
        out.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }

    pub fn list_windows() -> Result<Vec<WindowInfo>, DesktopError> {
        let mut out = Vec::new();
        let mut id: u64 = 1000;
        for app in Self::list_apps() {
            // Window names for this app (empty → the app has a main window
            // without a title — still list it with an empty title).
            let script = format!(
                "tell application \"System Events\" to tell process \"{}\" to get name of every window",
                app
            );
            let windows = Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();
            let names: Vec<String> = if windows.trim().is_empty() {
                vec![String::new()]
            } else {
                windows
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            };
            for title in names {
                id += 1;
                out.push(WindowInfo {
                    id,
                    title,
                    app: app.clone(),
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 0, // bounds require a second AX call — follow-on
                    has_a11y_tree: false,
                });
            }
        }
        Ok(out)
    }

    pub fn see(window: &WindowInfo) -> Result<SeeResult, DesktopError> {
        // `screencapture -l <id>` needs a CGWindowID; we carry our own id
        // space, so the caller must pass a real CGWindowID in window.id.
        let tmp = std::env::temp_dir().join(format!("everyaios-see-{}.png", window.id));
        let status = Command::new("screencapture")
            .args([
                "-l",
                &window.id.to_string(),
                "-x",
                tmp.to_str().unwrap_or("/tmp/e9.png"),
            ])
            .status()
            .map_err(|e| DesktopError::Platform(format!("screencapture: {e}")))?;
        if !status.success() {
            return Err(DesktopError::Platform(
                "screencapture failed — Screen Recording permission?".into(),
            ));
        }
        let bytes = std::fs::read(&tmp)
            .map_err(|e| DesktopError::Platform(format!("read capture: {e}")))?;
        let _ = std::fs::remove_file(&tmp);
        let img = image::load_from_memory(&bytes)
            .map_err(|e| DesktopError::Platform(format!("decode capture: {e}")))?;
        let (width, height) = img.dimensions();
        let mut png = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png);
        img.write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| DesktopError::Platform(format!("png encode: {e}")))?;
        Ok(SeeResult {
            window_id: window.id,
            png,
            width,
            height,
            method: SeeMethod::MacScreenCapture,
            region: Region::full(width, height),
            scale: 1.0,
        })
    }

    pub fn read(_window: &WindowInfo) -> Result<ReadResult, DesktopError> {
        Ok(ReadResult {
            window_id: _window.id,
            tree: None, // deep AX traversal follow-on → OCR fallback
            dpi_scale: 1.0,
            windows: Self::list_windows()?,
        })
    }

    pub fn act(
        window: &WindowInfo,
        act: &ActKind,
        mode: InteractionMode,
    ) -> Result<(), DesktopError> {
        // P57.1 — a launch is `open [-g] <path>`: `-g` is macOS's documented
        // "do not bring the application to the foreground", i.e. exactly the
        // background contract's no-activate rule. A `.app` bundle and a plain
        // binary are both accepted by `open`; a bare name stays a name-only
        // fallback (`open -a`), which is what the spec allows after path
        // resolution fails.
        if let ActKind::LaunchApp { path, app } = act {
            let mut cmd = Command::new("open");
            if mode == InteractionMode::Background {
                cmd.arg("-g");
            }
            match path.as_deref() {
                Some(p) if !p.is_empty() => {
                    let target = launch::resolve_target(Some(p), "", &[])?;
                    cmd.arg(target);
                }
                _ => {
                    if app.trim().is_empty() {
                        return Err(DesktopError::Platform(
                            "launch needs a path or an app name".into(),
                        ));
                    }
                    cmd.arg("-a").arg(app);
                }
            }
            let status = cmd
                .status()
                .map_err(|e| DesktopError::Platform(format!("open: {e}")))?;
            if !status.success() {
                return Err(DesktopError::Platform(
                    "open failed — is the bundle path correct?".into(),
                ));
            }
            return Ok(());
        }
        // Coordinate space: System Events uses screen points; the window id we
        // carry is our own — activate by app name + click by point.
        let app = &window.app;
        // P57.4 — a point-addressed System Events action is a genuine pointer
        // event: it moves the cursor and clicks wherever the cursor lands. There
        // is no macOS equivalent of a UIA invoke-by-point or a message click, so
        // the Background contract refuses these rather than breaking its promise.
        // (`click "name" of window 1` below is AXPress — that one is fine, and
        // is the background path for a named element.)
        if mode == InteractionMode::Background {
            let pointer_moving = matches!(
                act,
                ActKind::Click { .. } | ActKind::Scroll { .. } | ActKind::Drag { .. }
            );
            if pointer_moving {
                return Err(DesktopError::Unsupported(
                    "background contract: System Events clicks/scrolls/drags move the real \
                     pointer and macOS exposes no non-moving equivalent — use a named-element \
                     click, or switch the interaction default to Foreground (Settings → \
                     Computer use)"
                        .into(),
                ));
            }
        }
        let script = match act {
            ActKind::Click { x, y } => format!(
                "tell application \"System Events\" to click at {{{x}, {y}}}"
            ),
            ActKind::ClickByName { name } => format!(
                "tell application \"System Events\" to tell process \"{app}\" to click \"{name}\" of window 1"
            ),
            ActKind::Type { text } => {
                let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
                format!(
                    "tell application \"System Events\" to tell process \"{app}\" to keystroke \"{escaped}\""
                )
            }
            ActKind::Press { key } => {
                let code = match key.to_ascii_lowercase().as_str() {
                    "enter" | "return" => 36,
                    "tab" => 48,
                    "escape" | "esc" => 53,
                    "space" => 49,
                    "delete" => 51,
                    "left" => 123,
                    "up" => 126,
                    "right" => 124,
                    "down" => 125,
                    "home" => 115,
                    "end" => 119,
                    "pageup" => 116,
                    "pagedown" => 121,
                    _ => return Err(DesktopError::Platform(format!("unknown key {key}"))),
                };
                format!(
                    "tell application \"System Events\" to key code {code}"
                )
            }
            ActKind::Scroll { x, y, delta } => format!(
                "tell application \"System Events\" to tell process \"{app}\" to scroll {delta} at {{{x}, {y}}}"
            ),
            ActKind::SetValue { name, value } => {
                let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
                format!(
                    "tell application \"System Events\" to tell process \"{app}\" to set value of \"{name}\" of window 1 to \"{escaped}\""
                )
            }
            ActKind::Drag { from, to } => format!(
                "tell application \"System Events\" to drag from {{{}, {}}} to {{{}, {}}}",
                from.0, from.1, to.0, to.1
            ),
            ActKind::ActivateWindow { .. } => {
                // P57.3 — `activate` brings the app to the front, i.e. the
                // foreground escalation. Under Background the act refuses
                // rather than pretending (the engine refuses earlier too).
                if mode == InteractionMode::Background {
                    return Err(DesktopError::Unsupported(
                        "background contract: macOS `activate` is a foreground escalation — \
                         switch the interaction default to Foreground"
                            .into(),
                    ));
                }
                format!("tell application \"{app}\" to activate")
            }
            // Handled above (before the System Events script paths).
            ActKind::LaunchApp { .. } => {
                return Err(DesktopError::Platform(
                    "launch was not handled on the pre-script path".into(),
                ))
            }
        };
        let status = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map_err(|e| DesktopError::Platform(format!("osascript: {e}")))?;
        if !status.success() {
            return Err(DesktopError::Platform(
                "osascript failed — Accessibility permission? (System Settings → Privacy & Security \
                 → Accessibility)"
                    .into(),
            ));
        }
        Ok(())
    }

    /// P57.4 — this backend lists windows with **synthetic** ids (it walks the
    /// app list), so a real foreground window cannot be named back. Returning
    /// `None` is the honest answer: the engine then skips restore rather than
    /// restoring the wrong thing.
    pub fn foreground_window() -> Option<u64> {
        None
    }

    /// P57.4 — restore is unsupported here for the same reason; the engine
    /// surfaces this honestly instead of pretending the foreground was handed
    /// back.
    pub fn restore_foreground(_window_id: u64) -> Result<(), DesktopError> {
        Err(DesktopError::Unsupported(
            "macOS window ids are synthetic — the previous foreground cannot be restored by id"
                .into(),
        ))
    }

    /// P57.5 — Screen Recording consent (TCC). macOS returns a desktop-picture
    /// placeholder for an ungranted capture, so asking the OS is the only honest
    /// answer. On non-macOS hosts this probe is not reachable.
    #[cfg(target_os = "macos")]
    pub fn screen_recording_granted() -> bool {
        unsafe extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
        }
        // SAFETY: a side-effect-free CoreGraphics query.
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn screen_recording_granted() -> bool {
        false
    }

    /// P57.5 — Accessibility consent (TCC). A System Events read is refused with
    /// error -1743 when not granted, so the probe doubles as the check.
    pub fn accessibility_granted() -> bool {
        Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to get name of first process")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}
