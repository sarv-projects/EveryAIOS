//! X11 backend (Linux) — live-tested under Xvfb in the E2E suite.
//!
//! - **See:** `GetImage` on the window drawable → PNG.
//! - **Read:** EWMH `_NET_CLIENT_LIST` + `_NET_WM_NAME` + geometry; no UIA
//!   equivalent on bare X11 (AT-SPI is a follow-on) — `read_tree` returns
//!   `None` and the vision fallback (OCR) takes over.
//! - **Act:** XTEST fake input (button / motion / key), ASCII keysyms,
//!   `set_input_focus` + raise for activation, PATH resolve for launch.
//! - **DPI:** `Xft.dpi` root property (default 96 → scale 1.0).

use std::process::Command;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    AtomEnum, ChangeWindowAttributesAux, ConfigureWindowAux, EventMask, GetImageType, ImageFormat,
    InputFocus, KeyPressEvent, StackMode, Window, CURRENT_TIME,
};
use x11rb::protocol::xtest;
use x11rb::rust_connection::RustConnection;

use crate::types::{ActKind, ReadResult, ReadNode, Region, SeeMethod, SeeResult, WindowInfo};
use crate::DesktopError;

pub struct X11Backend {
    conn: RustConnection,
    screen: usize,
    root: Window,
}

/// Translate a byte-string property into a String.
fn prop_string(conn: &RustConnection, window: Window, atom: u32) -> Option<String> {
    let reply = conn
        .get_property(false, window, atom, AtomEnum::ANY, 0, 4096)
        .ok()?;
    let bytes = reply.value8()?;
    let text = String::from_utf8_lossy(&bytes).to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

impl X11Backend {
    pub fn connect() -> Result<Self, DesktopError> {
        let (conn, screen) = x11rb::connect(None).map_err(|e| {
            DesktopError::Platform(format!("X11 connect failed (DISPLAY set?): {e}"))
        })?;
        let root = conn.setup().roots[screen].root;
        Ok(Self {
            conn,
            screen,
            root,
        })
    }

    pub fn is_available() -> bool {
        std::env::var("DISPLAY").is_ok() && x11rb::connect(None).is_ok()
    }

    fn atom(&self, name: &[u8]) -> Option<u32> {
        self.conn
            .intern_atom(false, name)
            .ok()
            .map(|r| r.atom)
    }

    fn window_app(&self, window: Window) -> String {
        // Best effort: _NET_WM_PID → /proc/<pid>/comm
        if let Some(pid_atom) = self.atom(b"_NET_WM_PID") {
            if let Ok(reply) = self
                .conn
                .get_property(false, window, pid_atom, AtomEnum::ANY, 0, 1)
            {
                if let Some(v) = reply.value32() {
                    if let Some(pid) = v.first().copied() {
                        if let Ok(comm) = std::fs::read_to_string(format!("/proc/{pid}/comm")) {
                            return comm.trim().to_string();
                        }
                    }
                }
            }
        }
        "unknown".into()
    }

    fn window_geometry(&self, window: Window) -> Option<(i32, i32, u32, u32)> {
        let geo = self.conn.get_geometry(window).ok()?;
        // Translate to root coordinates.
        let tr = self
            .conn
            .translate_coordinates(window, self.root, 0, 0)
            .ok()?;
        Some((
            tr.dst_x,
            tr.dst_y,
            u32::from(geo.width),
            u32::from(geo.height),
        ))
    }

    fn window_title(&self, window: Window) -> String {
        let net_wm_name = self.atom(b"_NET_WM_NAME");
        let wm_name = self.atom(b"WM_NAME");
        if let Some(a) = net_wm_name {
            if let Some(t) = prop_string(&self.conn, window, a) {
                return t;
            }
        }
        if let Some(a) = wm_name {
            if let Some(t) = prop_string(&self.conn, window, a) {
                return t;
            }
        }
        String::new()
    }

    /// Enumerate top-level windows via EWMH.
    pub fn list_windows(&self) -> Result<Vec<WindowInfo>, DesktopError> {
        let client_list = self
            .atom(b"_NET_CLIENT_LIST")
            .ok_or_else(|| DesktopError::Platform("no _NET_CLIENT_LIST (is a WM running?)".into()))?;
        let reply = self
            .conn
            .get_property(false, self.root, client_list, AtomEnum::ANY, 0, 4096)
            .map_err(|e| DesktopError::Platform(format!("_NET_CLIENT_LIST read: {e}")))?;
        let mut out = Vec::new();
        if let Some(windows) = reply.value32() {
            for w in windows {
                let window = Window::from(*w);
                let title = self.window_title(window);
                let app = self.window_app(window);
                if title.is_empty() && app == "unknown" {
                    continue;
                }
                if let Some((x, y, width, height)) = self.window_geometry(window) {
                    out.push(WindowInfo {
                        id: u64::from(window),
                        title,
                        app,
                        x,
                        y,
                        width,
                        height,
                        has_a11y_tree: false,
                    });
                }
            }
        }
        Ok(out)
    }

    pub fn read(&self, window: &WindowInfo) -> Result<ReadResult, DesktopError> {
        let windows = self.list_windows()?;
        Ok(ReadResult {
            window_id: window.id,
            tree: None, // no UIA equivalent on bare X11 → OCR fallback
            dpi_scale: self.dpi_scale(),
            windows,
        })
    }

    fn dpi_scale(&self) -> f64 {
        if let Some(a) = self.atom(b"Xft.dpi") {
            if let Ok(reply) = self
                .conn
                .get_property(false, self.root, a, AtomEnum::ANY, 0, 1)
            {
                if let Some(v) = reply.value32() {
                    if let Some(dpi) = v.first().copied() {
                        if dpi > 0 {
                            return f64::from(dpi) / 96.0;
                        }
                    }
                }
            }
        }
        1.0
    }

    /// Capture a window (or sub-region) as PNG via XGetImage.
    pub fn see(&self, window: &WindowInfo, region: Region) -> Result<SeeResult, DesktopError> {
        let win = Window::from(window.id as u32);
        let (gx, gy, gw, gh) = self.window_geometry(win).ok_or_else(|| {
            DesktopError::Platform(format!("window {} gone", window.id))
        })?;
        // Clamp the requested region into the window.
        let full = Region {
            x: gx,
            y: gy,
            width: gw,
            height: gh,
        };
        let abs = Region {
            x: gx + region.x,
            y: gy + region.y,
            width: region.width,
            height: region.height,
        };
        let r = full
            .intersect(&abs)
            .ok_or_else(|| DesktopError::InvalidRegion("requested region outside window".into()))?;
        let img = self
            .conn
            .get_image(ImageFormat::ZPixmap, win, r.x, r.y, r.width, r.height, !0)
            .map_err(|e| DesktopError::Platform(format!("GetImage: {e}")))?;
        let depth = img.depth;
        let bpp = if depth == 24 { 4 } else { 4 }; // ZPixmap 24/32 → 4 bytes/px
        let bytes_per_row = (r.width as usize) * bpp;
        let data = &img.data;
        // Build an RGBA buffer: X stores BGR(A) little-endian.
        let mut rgba = Vec::with_capacity((r.width as usize) * (r.height as usize) * 4);
        for row in 0..r.height as usize {
            let start = row * bytes_per_row;
            for col in 0..r.width as usize {
                let i = start + col * bpp;
                let b = data[i];
                let g = data[i + 1];
                let rp = data[i + 2];
                rgba.extend_from_slice(&[rp, g, b, 255]);
            }
        }
        let buf = image::RgbaImage::from_raw(r.width, r.height, rgba)
            .ok_or_else(|| DesktopError::Platform("image buffer malformed".into()))?;
        let mut png: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png);
        image::DynamicImage::ImageRgba8(buf)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| DesktopError::Platform(format!("png encode: {e}")))?;
        Ok(SeeResult {
            window_id: window.id,
            png,
            width: r.width,
            height: r.height,
            method: SeeMethod::X11GetImage,
            region: r,
            scale: self.dpi_scale(),
        })
    }

    // ---- Act (XTEST) ----

    fn xtest_available(&self) -> bool {
        self.conn
            .extension_information(xtest::X11_EXTENSION_NAME)
            .ok()
            .flatten()
            .is_some()
    }

    fn fake_button(&self, detail: u8, press: bool, x: i16, y: i16) -> Result<(), DesktopError> {
        let event = if press { 4 } else { 5 }; // ButtonPress / ButtonRelease
        xtest::fake_input(
            &self.conn,
            event,
            detail,
            CURRENT_TIME,
            self.root,
            x,
            y,
        )
        .map_err(|e| DesktopError::Platform(format!("xtest button: {e}")))
    }

    fn fake_motion(&self, x: i16, y: i16) -> Result<(), DesktopError> {
        xtest::fake_input(&self.conn, 2 /* MotionNotify */, 0, CURRENT_TIME, self.root, x, y)
            .map_err(|e| DesktopError::Platform(format!("xtest motion: {e}")))
    }

    fn fake_key(&self, keysym: u32, press: bool) -> Result<(), DesktopError> {
        let keycode = x11rb::keysym::keysym_to_keycode(&self.conn, keysym)
            .map_err(|e| DesktopError::Platform(format!("keysym→keycode: {e}")))?;
        let event = if press { 2 } else { 3 }; // KeyPress / KeyRelease
        xtest::fake_input(
            &self.conn,
            event,
            u8::from(keycode),
            CURRENT_TIME,
            self.root,
            0,
            0,
        )
        .map_err(|e| DesktopError::Platform(format!("xtest key: {e}")))
    }

    fn named_key_to_keysym(key: &str) -> Option<u32> {
        match key.to_ascii_lowercase().as_str() {
            "enter" | "return" => Some(0xff0d),
            "tab" => Some(0xff09),
            "space" => Some(0x20),
            "escape" | "esc" => Some(0xff1b),
            "backspace" => Some(0xff08),
            "delete" => Some(0xffff),
            "left" => Some(0xff51),
            "up" => Some(0xff52),
            "right" => Some(0xff53),
            "down" => Some(0xff54),
            "home" => Some(0xff50),
            "end" => Some(0xff57),
            "pageup" => Some(0xff55),
            "pagedown" => Some(0xff56),
            "f1" => Some(0xffbe),
            "f2" => Some(0xffbf),
            "f3" => Some(0xffc0),
            "f4" => Some(0xffc1),
            "f5" => Some(0xffc2),
            "f6" => Some(0xffc3),
            "f7" => Some(0xffc4),
            "f8" => Some(0xffc5),
            "f9" => Some(0xffc6),
            "f10" => Some(0xffc7),
            "f11" => Some(0xffc8),
            "f12" => Some(0xffc9),
            _ => {
                // Single printable ASCII char.
                let b = key.as_bytes();
                if b.len() == 1 && b[0].is_ascii_graphic() || b.len() == 1 && b[0] == b' ' {
                    Some(u32::from(b[0]))
                } else {
                    None
                }
            }
        }
    }

    fn type_char(&self, c: char) -> Result<(), DesktopError> {
        let keysym = if c.is_ascii() {
            u32::from(c as u8)
        } else {
            // Non-ASCII: try the keysym unicode mapping if available.
            x11rb::keysym::unicode_to_keysym(c).unwrap_or(0)
        };
        if keysym == 0 {
            return Err(DesktopError::Platform(format!(
                "no keysym for character {c:?}"
            )));
        }
        self.fake_key(keysym, true)?;
        self.fake_key(keysym, false)
    }

    pub fn act(&self, window: &WindowInfo, act: &ActKind) -> Result<(), DesktopError> {
        if !self.xtest_available() {
            return Err(DesktopError::Platform(
                "XTEST extension not available on this X server".into(),
            ));
        }
        let (wx, wy, _, _) = self
            .window_geometry(Window::from(window.id as u32))
            .ok_or_else(|| DesktopError::Platform(format!("window {} gone", window.id)))?;
        match act {
            ActKind::Click { x, y } => {
                let (sx, sy) = (wx + x, wy + y);
                self.fake_motion(sx as i16, sy as i16)?;
                self.fake_button(1, true, sx as i16, sy as i16)?;
                self.fake_button(1, false, sx as i16, sy as i16)
            }
            ActKind::Scroll { x, y, delta } => {
                let (sx, sy) = (wx + x, wy + y);
                self.fake_motion(sx as i16, sy as i16)?;
                let (up, down) = (4u8, 5u8);
                let n = delta.abs().min(50);
                for _ in 0..n {
                    self.fake_button(if *delta > 0 { up } else { down }, true, sx as i16, sy as i16)?;
                    self.fake_button(if *delta > 0 { up } else { down }, false, sx as i16, sy as i16)?;
                }
                Ok(())
            }
            ActKind::Drag { from, to } => {
                let (x0, y0) = (wx + from.0, wy + from.1);
                let (x1, y1) = (wx + to.0, wy + to.1);
                self.fake_motion(x0 as i16, y0 as i16)?;
                self.fake_button(1, true, x0 as i16, y0 as i16)?;
                // A few intermediate steps so the target sees motion events.
                for i in 1..=8 {
                    let t = i as f64 / 8.0;
                    let mx = (x0 as f64 + (x1 - x0) as f64 * t) as i16;
                    let my = (y0 as f64 + (y1 - y0) as f64 * t) as i16;
                    self.fake_motion(mx, my)?;
                }
                self.fake_button(1, false, x1 as i16, y1 as i16)
            }
            ActKind::Press { key } => {
                let ks = Self::named_key_to_keysym(key)
                    .ok_or_else(|| DesktopError::Platform(format!("unknown key {key}")))?;
                self.fake_key(ks, true)?;
                self.fake_key(ks, false)
            }
            ActKind::Type { text } => {
                for c in text.chars() {
                    if c == '\n' {
                        let ks = Self::named_key_to_keysym("enter").unwrap();
                        self.fake_key(ks, true)?;
                        self.fake_key(ks, false)?;
                    } else {
                        self.type_char(c)?;
                    }
                }
                Ok(())
            }
            ActKind::ActivateWindow { window_id } => {
                let w = Window::from(*window_id as u32);
                let _ = self.conn.configure_window(
                    w,
                    &ConfigureWindowAux::new().stack_mode(StackMode::Above),
                );
                self.conn
                    .set_input_focus(
                        InputFocus::Window(w),
                        x11rb::protocol::xproto::RevertTo::Parent,
                        CURRENT_TIME,
                    )
                    .map_err(|e| DesktopError::Platform(format!("set_input_focus: {e}")))
            }
            ActKind::ClickByName { name } => {
                // No UIA on X11 — the caller should resolve the name via OCR
                // first; reaching here with a raw name is a policy bug.
                Err(DesktopError::Platform(format!(
                    "ClickByName has no X11 surface (OCR must resolve \"{name}\" first)"
                )))
            }
            ActKind::SetValue { name, .. } => Err(DesktopError::Platform(format!(
                "SetValue has no X11 surface (name \"{name}\")"
            ))),
            ActKind::LaunchApp { app } => {
                // Resolve on PATH and spawn detached.
                let resolved = Command::new("sh")
                    .arg("-c")
                    .arg(format!("command -v {app}"))
                    .output()
                    .map_err(|e| DesktopError::Platform(format!("resolve {app}: {e}")))?;
                let path = String::from_utf8_lossy(&resolved.stdout).trim().to_string();
                if path.is_empty() {
                    return Err(DesktopError::Platform(format!("{app} not on PATH")));
                }
                let mut child = Command::new("sh")
                    .arg("-c")
                    .arg(format!("{path} >/dev/null 2>&1 &"))
                    .spawn()
                    .map_err(|e| DesktopError::Platform(format!("launch {app}: {e}")))?;
                let _ = child.wait();
                Ok(())
            }
        }
    }
}

/// Keep the compiler honest: KeyPressEvent import is unused in this module
/// (kept for the future `--sync` keyboard path); reference it to avoid churn.
#[allow(dead_code)]
fn _unused(_e: &KeyPressEvent) {}

/// Suppress unused warnings for event-mask aux (used by future pointer grab).
#[allow(dead_code)]
fn _aux() -> ChangeWindowAttributesAux {
    ChangeWindowAttributesAux::new().event_mask(EventMask::NO_EVENT)
}

#[allow(dead_code)]
fn _image_type() -> GetImageType {
    GetImageType::ZPixmap
}
