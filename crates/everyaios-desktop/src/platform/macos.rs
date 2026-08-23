//! macOS backend (E9 twin) — zero-dependency subprocess surface, the same
//! shape as ChatGPT Mac Computer Use:
//!
//! - **See:** `screencapture -l <windowid> -x` (Screen Recording permission).
//! - **Read:** `osascript` System Events for the app + window list; deep AX
//!   tree traversal is a follow-on (this build reads windows + OCR).
//! - **Act:** System Events `click at`, `keystroke`, `key code`, scroll via
//!   `scroll` action (Accessibility permission).
//!
//! Compiles on every target; live use requires macOS + the two TCC
//! permissions, surfaced honestly through `capabilities()`.

use std::process::Command;

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
            .args(["-l", &window.id.to_string(), "-x", tmp.to_str().unwrap_or("/tmp/e9.png")])
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

    pub fn act(window: &WindowInfo, act: &ActKind) -> Result<(), DesktopError> {
        // Coordinate space: System Events uses screen points; the window id we
        // carry is our own — activate by app name + click by point.
        let app = &window.app;
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
                format!("tell application \"{app}\" to activate")
            }
            ActKind::LaunchApp { app: name } => {
                format!("tell application \"{name}\" to activate")
            }
        };
        let status = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map_err(|e| DesktopError::Platform(format!("osascript: {e}")))?;
        if !status.success() {
            return Err(DesktopError::Platform(
                "osascript failed — Accessibility permission? (System Settings → Privacy & Security → Accessibility)",
            ));
        }
        Ok(())
    }
}
