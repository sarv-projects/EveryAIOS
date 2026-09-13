//! Platform backends for E9.
//!
//! One union contract (`see`/`read`/`act`), three backends:
//! - [`linux`] — X11 (EWMH + XGetImage + XTEST), live-tested under Xvfb.
//! - [`win`] — UIA tree + Invoke/SetValue + SendInput + PrintWindow/DC,
//!   cross-compile-checked for x86_64-pc-windows-msvc.
//! - [`macos`] — `screencapture` + `osascript` System Events (zero deps).

#[cfg(target_os = "linux")]
pub mod linux;
// The macOS backend is dependency-free `std::process` plus this crate's own
// types, so it also compiles in test builds on every host. That is deliberate:
// a darwin-only `cfg` means a typo there is invisible until someone builds on a
// Mac (this module shipped two real compile errors exactly that way — a missing
// `GenericImageView` import and a `&str` handed to a `String` variant). `cargo
// test` now proves all three backends still compile.
#[cfg(any(target_os = "macos", test))]
pub mod macos;
#[cfg(windows)]
pub mod win;

use crate::policy::InteractionMode;
use crate::types::{ActKind, ReadResult, Region, SeeMethod, SeeResult, WindowInfo};
use crate::{Capabilities, DesktopError};

/// A live desktop backend for the current platform.
/// `X11` carries a live connection (large variant) — boxed is overkill since
/// the enum is never stored in arrays or copied.
#[allow(clippy::large_enum_variant)]
pub enum PlatformBackend {
    #[cfg(target_os = "linux")]
    X11(crate::platform::linux::X11Backend),
    #[cfg(windows)]
    Win,
    #[cfg(target_os = "macos")]
    Mac,
    Unsupported,
}

impl PlatformBackend {
    /// Try to construct the current platform's backend.
    pub fn current() -> Result<Self, DesktopError> {
        #[cfg(target_os = "linux")]
        {
            if crate::platform::linux::X11Backend::is_available() {
                Ok(PlatformBackend::X11(
                    crate::platform::linux::X11Backend::connect()?,
                ))
            } else {
                Err(DesktopError::Unsupported(
                    "no X11 DISPLAY available — E9 needs a desktop session".into(),
                ))
            }
        }
        #[cfg(windows)]
        {
            Ok(PlatformBackend::Win)
        }
        #[cfg(target_os = "macos")]
        {
            Ok(PlatformBackend::Mac)
        }
        #[cfg(not(any(target_os = "linux", windows, target_os = "macos")))]
        {
            Err(DesktopError::Unsupported(
                "E9 is supported on Linux (X11), Windows and macOS".into(),
            ))
        }
    }

    pub fn list_windows(&self) -> Result<Vec<WindowInfo>, DesktopError> {
        match self {
            #[cfg(target_os = "linux")]
            PlatformBackend::X11(b) => b.list_windows(),
            #[cfg(windows)]
            PlatformBackend::Win => crate::platform::win::WinBackend::list_windows(),
            #[cfg(target_os = "macos")]
            PlatformBackend::Mac => crate::platform::macos::MacBackend::list_windows(),
            PlatformBackend::Unsupported => Err(DesktopError::Unsupported("no backend".into())),
        }
    }

    pub fn read(&self, window: &WindowInfo) -> Result<ReadResult, DesktopError> {
        match self {
            #[cfg(target_os = "linux")]
            PlatformBackend::X11(b) => b.read(window),
            #[cfg(windows)]
            PlatformBackend::Win => crate::platform::win::WinUia::init()?.read(window),
            #[cfg(target_os = "macos")]
            PlatformBackend::Mac => crate::platform::macos::MacBackend::read(window),
            PlatformBackend::Unsupported => Err(DesktopError::Unsupported("no backend".into())),
        }
    }

    pub fn see(&self, window: &WindowInfo, region: Region) -> Result<SeeResult, DesktopError> {
        match self {
            #[cfg(target_os = "linux")]
            PlatformBackend::X11(b) => b.see(window, region),
            #[cfg(windows)]
            PlatformBackend::Win => crate::platform::win::WinBackend::see(window, region),
            #[cfg(target_os = "macos")]
            PlatformBackend::Mac => crate::platform::macos::MacBackend::see(window),
            PlatformBackend::Unsupported => Err(DesktopError::Unsupported("no backend".into())),
        }
    }

    /// P57.3 — `mode` is the policy's interaction default. Every backend must
    /// honour it: under `Background` nothing may be raised, focused or activated
    /// (`SetForegroundWindow`, EWMH stacking + `set_input_focus`, or macOS
    /// `activate`), and a launch must not steal focus
    /// (`SW_SHOWNOACTIVATE` / `open -g`).
    pub fn act(
        &self,
        window: &WindowInfo,
        act: &ActKind,
        mode: InteractionMode,
    ) -> Result<(), DesktopError> {
        match self {
            #[cfg(target_os = "linux")]
            PlatformBackend::X11(b) => b.act(window, act, mode),
            #[cfg(windows)]
            PlatformBackend::Win => crate::platform::win::act(window, act, None, mode),
            #[cfg(target_os = "macos")]
            PlatformBackend::Mac => crate::platform::macos::MacBackend::act(window, act, mode),
            PlatformBackend::Unsupported => Err(DesktopError::Unsupported("no backend".into())),
        }
    }

    /// Honest per-platform capability surface.
    pub fn capabilities(&self) -> Capabilities {
        let ocr_available = crate::ocr::TesseractCli::default().available();
        match self {
            #[cfg(target_os = "linux")]
            PlatformBackend::X11(_) => Capabilities {
                see: SeeMethod::X11GetImage,
                see_occluded: false,
                uia_tree: false,
                invoke_set_value: false,
                send_input: true,
                // Synthetic ButtonPress/ButtonRelease to the deepest child
                // under the point: the server moves nothing.
                background_input: true,
                ocr: ocr_available,
                window_list: true,
                launch_app: true,
            },
            #[cfg(windows)]
            PlatformBackend::Win => Capabilities {
                see: SeeMethod::PrintWindow,
                // WGC (occluded capture) is the documented follow-on seam.
                see_occluded: false,
                uia_tree: true,
                invoke_set_value: true,
                send_input: true,
                // UIA InvokePattern at the hit-test point, else PostMessage to
                // the target HWND.
                background_input: true,
                ocr: ocr_available,
                window_list: true,
                launch_app: true,
            },
            #[cfg(target_os = "macos")]
            PlatformBackend::Mac => Capabilities {
                see: SeeMethod::MacScreenCapture,
                see_occluded: false,
                uia_tree: false,
                invoke_set_value: false,
                send_input: true,
                // System Events `click at` is a real pointer event, so a
                // background coordinate click cannot be delivered here.
                background_input: false,
                ocr: ocr_available,
                window_list: true,
                launch_app: true,
            },
            PlatformBackend::Unsupported => Capabilities::default(),
        }
    }
}
